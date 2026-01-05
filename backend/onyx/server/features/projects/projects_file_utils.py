from math import ceil

from fastapi import UploadFile
from PIL import Image
from PIL import ImageOps
from PIL import UnidentifiedImageError
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field

from onyx.file_processing.extract_file_text import ACCEPTED_IMAGE_FILE_EXTENSIONS
from onyx.file_processing.extract_file_text import ALL_ACCEPTED_FILE_EXTENSIONS
from onyx.file_processing.extract_file_text import extract_file_text
from onyx.file_processing.extract_file_text import get_file_ext
from onyx.llm.factory import get_default_llms
from onyx.natural_language_processing.utils import get_tokenizer
from onyx.utils.logger import setup_logger
from shared_configs.configs import MULTI_TENANT
from shared_configs.configs import SKIP_USERFILE_THRESHOLD
from shared_configs.configs import SKIP_USERFILE_THRESHOLD_TENANT_LIST
from shared_configs.contextvars import get_current_tenant_id

# New imports for user context
from sqlalchemy import select
from sqlalchemy.orm import Session
from onyx.db.models import User
from onyx.db.llm import fetch_existing_llm_providers, can_user_access_llm_provider, fetch_user_group_ids
from onyx.llm.factory import get_llm
from onyx.db.models import LLMProvider as LLMProviderModel
from onyx.server.manage.llm.models import LLMProviderView
from onyx.llm.interfaces import LLM


logger = setup_logger()
FILE_TOKEN_COUNT_THRESHOLD = 100000
UNKNOWN_FILENAME = "[unknown_file]"  # More descriptive than empty string


def get_safe_filename(upload: UploadFile) -> str:
    """Get filename from upload, with fallback to UNKNOWN_FILENAME if None."""
    if not upload.filename:
        logger.warning("Received upload with no filename")
        return UNKNOWN_FILENAME
    return upload.filename


# Guard against extremely large images
Image.MAX_IMAGE_PIXELS = 12000 * 12000


class CategorizedFiles(BaseModel):
    acceptable: list[UploadFile] = Field(default_factory=list)
    non_accepted: list[str] = Field(default_factory=list)
    unsupported: list[str] = Field(default_factory=list)
    acceptable_file_to_token_count: dict[str, int] = Field(default_factory=dict)

    # Allow FastAPI UploadFile instances
    model_config = ConfigDict(arbitrary_types_allowed=True)


def _apply_long_side_cap(width: int, height: int, cap: int) -> tuple[int, int]:
    if max(width, height) <= cap:
        return width, height
    scale = cap / max(width, height)
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    return new_w, new_h


def _estimate_image_tokens(
    width: int, height: int, patch_size: int, overhead: int
) -> int:
    patches_w = ceil(width / patch_size)
    patches_h = ceil(height / patch_size)
    patches = patches_w * patches_h
    return patches + overhead


def estimate_image_tokens_for_upload(
    upload: UploadFile,
    cap_long_side: int = 2048,
    patch_size: int = 16,
    overhead_tokens: int = 32,
) -> int:
    """Open the uploaded image, normalize orientation, cap long side, and estimate tokens.

    Parameters
    - cap_long_side: Maximum pixels allowed on the image's longer side before estimating.
      Rationale: Many vision-language encoders downsample images so the longer side is
      bounded (commonly around 1024–2048px). Capping avoids unbounded patch counts and
      keeps costs predictable while preserving most semantic content for typical UI/docs.
      Default 2048 is a balanced choice between fidelity and token cost.

    - patch_size: The pixel size of square patches used in a rough ViT-style estimate.
      Rationale: Modern vision backbones (e.g., ViT variants) commonly operate on 14–16px
      patches. Using 16 simplifies the estimate and aligns with widely used configurations.
      Each patch approximately maps to one visual token in this heuristic.

    - overhead_tokens: Fixed per-image overhead to account for special tokens, metadata,
      and prompt framing added by providers. Rationale: Real models add tens of tokens per
      image beyond pure patch count. 32 is a conservative, stable default that avoids
      undercounting.

    Notes
    - This is a heuristic estimation for budgeting and gating. Actual tokenization varies
      by model/provider and may differ slightly.

    Always resets the file pointer before returning.
    """
    try:
        img = Image.open(upload.file)
        img = ImageOps.exif_transpose(img)
        width, height = img.size
        capped_w, capped_h = _apply_long_side_cap(width, height, cap=cap_long_side)
        return _estimate_image_tokens(
            capped_w, capped_h, patch_size=patch_size, overhead=overhead_tokens
        )
    finally:
        try:
            upload.file.seek(0)
        except Exception:
            pass



def get_user_preferred_llm(user: User | None, db_session: Session) -> tuple[LLM, LLM]:
    """
    Selects the best available LLM for the user context.
    Priority:
    1. Check all providers accessible to the user.
    2. Prefer a NON-default provider (Project/Personal) over the Global Default.
    3. Fallback to Global Default (Standard Provider) if no specific provider found.
    """
    try:
        # 1. Fetch all providers and user groups
        all_providers = fetch_existing_llm_providers(db_session)
        user_group_ids = fetch_user_group_ids(db_session, user)
        
        accessible_providers = []
        default_provider_model = None
        
        # 2. Filter accessible providers
        for provider in all_providers:
            if provider.is_default_provider:
                default_provider_model = provider
            
            if can_user_access_llm_provider(
                provider, 
                user_group_ids, 
                persona=None  # No persona context for file upload
            ):
                accessible_providers.append(provider)
        
        # 3. Selection Rule: Prefer Non-Default (Personal/Project)
        selected_provider = None
        
        # Look for non-default accessible provider first
        for p in accessible_providers:
            if not p.is_default_provider:
                selected_provider = p
                break
        
        # If no custom provider, use default if accessible (Standard User case)
        if not selected_provider and default_provider_model in accessible_providers:
            selected_provider = default_provider_model
            
        # 4. Fallback: If still nothing (shouldn't happen for valid users), try global default
        if not selected_provider:
            logger.warning(f"No accessible provider found for user {getattr(user, 'id', 'anon')}. Trying global default fallback.")
            return get_default_llms()

        # Build LLM Objects
        logger.info(f"Context-Aware Upload: Using Provider '{selected_provider.name}' for user {getattr(user, 'id', 'anon')}")
        
        provider_view = LLMProviderView.from_model(selected_provider)
        # SECURITY: Mask API key in logs immediately if it was ever logged (it wasn't here, but good practice to ensure view usage)
        if provider_view.api_key:
             # We need raw key for get_llm, so we don't mask the object itself, but ensure we don't log it.
             pass
        model_name = selected_provider.default_model_name
        
        if not model_name:
             raise ValueError(f"Provider {selected_provider.name} has no default model.")

        llm = get_llm(
            provider=provider_view.provider,
            model=model_name,
            deployment_name=provider_view.deployment_name,
            api_key=provider_view.api_key,
            api_base=provider_view.api_base,
            api_version=provider_view.api_version,
            custom_config=provider_view.custom_config,
            max_input_tokens=100000 # Use large default for utils
        )
        
        # We only need one LLM for tokenization in this util
        return llm, llm 

    except Exception as e:
        logger.error(f"Failed to determination user-preferred LLM: {str(e)[:200]}") # Truncate error to avoid dumping huge payloads
        return get_default_llms()


def categorize_uploaded_files(
    files: list[UploadFile], 
    user: User | None = None, 
    db_session: Session | None = None
) -> CategorizedFiles:
    """
    Categorize uploaded files based on text extractability and tokenized length.
    Now supports user context to select the correct LLM provider (BYOK vs Standard).
    """

    results = CategorizedFiles()
    
    # Resolve LLM using context if available
    if user and db_session:
        llm, _ = get_user_preferred_llm(user, db_session)
    else:
        # Fallback for legacy calls or missing context
        llm, _ = get_default_llms()

    tokenizer = get_tokenizer(
        model_name=llm.config.model_name, provider_type=llm.config.model_provider
    )

    # Check if threshold checks should be skipped
    skip_threshold = False

    # Check global skip flag (works for both single-tenant and multi-tenant)
    if SKIP_USERFILE_THRESHOLD:
        skip_threshold = True
        logger.info("Skipping userfile threshold check (global setting)")
    # Check tenant-specific skip list (only applicable in multi-tenant)
    elif MULTI_TENANT and SKIP_USERFILE_THRESHOLD_TENANT_LIST:
        try:
            current_tenant_id = get_current_tenant_id()
            skip_threshold = current_tenant_id in SKIP_USERFILE_THRESHOLD_TENANT_LIST
            if skip_threshold:
                logger.info(
                    f"Skipping userfile threshold check for tenant: {current_tenant_id}"
                )
        except RuntimeError as e:
            logger.warning(f"Failed to get current tenant ID: {str(e)}")

    for upload in files:
        try:
            filename = get_safe_filename(upload)
            extension = get_file_ext(filename)

            # If image, estimate tokens via dedicated method first
            if extension in ACCEPTED_IMAGE_FILE_EXTENSIONS:
                try:
                    token_count = estimate_image_tokens_for_upload(upload)
                except (UnidentifiedImageError, OSError) as e:
                    logger.warning(
                        f"Failed to process image file '{filename}': {str(e)}"
                    )
                    results.unsupported.append(filename)
                    continue

                if not skip_threshold and token_count > FILE_TOKEN_COUNT_THRESHOLD:
                    results.non_accepted.append(filename)
                else:
                    results.acceptable.append(upload)
                    results.acceptable_file_to_token_count[filename] = token_count
                continue

            # Otherwise, handle as text/document: extract text and count tokens
            if (
                extension in ALL_ACCEPTED_FILE_EXTENSIONS
                and extension not in ACCEPTED_IMAGE_FILE_EXTENSIONS
            ):
                text_content = extract_file_text(
                    file=upload.file,
                    file_name=filename,
                    break_on_unprocessable=False,
                    extension=extension,
                )
                if not text_content:
                    logger.warning(f"No text content extracted from '{filename}'")
                    results.unsupported.append(filename)
                    continue

                token_count = len(tokenizer.encode(text_content))
                if not skip_threshold and token_count > FILE_TOKEN_COUNT_THRESHOLD:
                    results.non_accepted.append(filename)
                else:
                    results.acceptable.append(upload)
                    results.acceptable_file_to_token_count[filename] = token_count

                # Reset file pointer for subsequent upload handling
                try:
                    upload.file.seek(0)
                except Exception as e:
                    logger.warning(
                        f"Failed to reset file pointer for '{filename}': {str(e)}"
                    )
                continue

            # If not recognized as supported types above, mark unsupported
            logger.warning(
                f"Unsupported file extension '{extension}' for file '{filename}'"
            )
            results.unsupported.append(filename)
        except Exception as e:
            logger.warning(
                f"Failed to process uploaded file '{get_safe_filename(upload)}' (error_type={type(e).__name__}, error={str(e)})"
            )
            results.unsupported.append(get_safe_filename(upload))

    return results
