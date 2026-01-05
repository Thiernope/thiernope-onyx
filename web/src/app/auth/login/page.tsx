import { HealthCheckBanner } from "@/components/health/healthcheck";
import { User } from "@/lib/types";
import {
  getCurrentUserSS,
  getAuthUrlSS,
  getAuthTypeMetadataSS,
  AuthTypeMetadata,
} from "@/lib/userSS";
import { redirect } from "next/navigation";
import AuthFlowContainer from "@/components/auth/AuthFlowContainer";
import LoginPage from "./LoginPage";
import { AuthType } from "@/lib/constants";

export interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  const autoRedirectDisabled = searchParams?.disableAutoRedirect === "true";
  const nextUrl = Array.isArray(searchParams?.next)
    ? searchParams?.next[0]
    : searchParams?.next || null;

  // catch cases where the backend is completely unreachable here
  // without try / catch, will just raise an exception and the page
  // will not render
  let authTypeMetadata: AuthTypeMetadata | null = null;
  let currentUser: User | null = null;
  try {
    [authTypeMetadata, currentUser] = await Promise.all([
      getAuthTypeMetadataSS(),
      getCurrentUserSS(),
    ]);
  } catch (e) {
    console.log(`Some fetch failed for the login page - ${e}`);
  }

  // simply take the user to the home page if Auth is disabled
  if (authTypeMetadata?.authType === AuthType.DISABLED) {
    return redirect("/chat");
  }

  // RESTRICT ACCESS: Redirect to Daxno if not admin and not logged in
  const adminKey = process.env.NEXT_PUBLIC_ADMIN_ACCESS_KEY || "true";
  const isValidAdmin = searchParams?.admin === adminKey;
  const daxnoUrl = process.env.NEXT_PUBLIC_DAXNO_URL || "http://localhost:3001";

  if (!currentUser && !isValidAdmin) {
    return redirect(daxnoUrl);
  }

  // if user is already logged in, take them to the main app page
  if (currentUser && currentUser.is_active && !currentUser.is_anonymous_user) {
    console.log("Login page: User is logged in, redirecting to chat", {
      userId: currentUser.id,
      is_active: currentUser.is_active,
      is_anonymous: currentUser.is_anonymous_user,
    });

    if (authTypeMetadata?.requiresVerification && !currentUser.is_verified) {
      return redirect("/auth/waiting-on-verification");
    }

    // Add a query parameter to indicate this is a redirect from login
    // This will help prevent redirect loops
    if (nextUrl) {
      if (nextUrl.startsWith("/")) {
        return redirect(nextUrl);
      }
      try {
        const url = new URL(nextUrl);
        // Only allow redirect to the same domain or relative paths
        if (url.origin === process.env.NEXT_PUBLIC_WEB_DOMAIN || url.origin === process.env.WEB_DOMAIN || url.origin === "http://localhost:3000") {
          return redirect(nextUrl);
        }
      } catch (e) {
        // ignore invalid urls
      }
    }
    return redirect("/chat?from=login");
  }

  // get where to send the user to authenticate
  let authUrl: string | null = null;
  if (authTypeMetadata) {
    try {
      authUrl = await getAuthUrlSS(authTypeMetadata.authType, nextUrl!);
    } catch (e) {
      console.log(`Some fetch failed for the login page - ${e}`);
    }
  }

  if (authTypeMetadata?.autoRedirect && authUrl && !autoRedirectDisabled) {
    return redirect(authUrl);
  }

  const ssoLoginFooterContent =
    authTypeMetadata &&
      (authTypeMetadata.authType === AuthType.GOOGLE_OAUTH ||
        authTypeMetadata.authType === AuthType.OIDC ||
        authTypeMetadata.authType === AuthType.SAML) ? (
      <>Need access? Reach out to your IT admin to get access.</>
    ) : undefined;

  return (
    <div className="flex flex-col ">
      <AuthFlowContainer
        authState="login"
        footerContent={ssoLoginFooterContent}
      >
        <div className="absolute top-10x w-full">
          <HealthCheckBanner />
        </div>

        <LoginPage
          authUrl={authUrl}
          authTypeMetadata={authTypeMetadata}
          nextUrl={nextUrl!}
          hidePageRedirect={true}
        />
      </AuthFlowContainer>
    </div>
  );
}
