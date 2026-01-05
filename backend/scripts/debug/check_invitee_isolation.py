
from sqlalchemy import create_engine, text
from onyx.db.models import User, UserGroup, User__UserGroup, UserProject, LLMProvider
from sqlalchemy.orm import Session

engine = create_engine("postgresql://onyx:onyx_postgres_password_change_me@relational_db:5432/onyx")

with Session(engine) as session:
    print("--- User List (Last 10) ---")
    users = session.query(User).order_by(User.id.desc()).limit(10).all()

    for u in users:
        print(f"\nID: {u.id}")
        print(f"Email: {u.email}")
        print(f"Role: {u.role}")
        print(f"Default Model: {u.default_model}")
        groups = session.query(UserGroup).join(User__UserGroup).filter(User__UserGroup.user_id == u.id).all()
        print(f"Groups: {[g.name for g in groups]}")
        
    print("\n--- LLM Providers Visibility ---")
    providers = session.query(LLMProvider).all()
    for p in providers:
        groups = [g.name for g in p.groups]
        print(f"Provider: {p.name}, Public: {p.is_public}, Default Model: {p.default_model_name}, Groups: {groups}")

    print("\n--- Project Groups Check ---")
    project_groups = session.query(UserGroup).filter(UserGroup.name.like("Project-%")).all()
    for pg in project_groups:
        print(f"Group: {pg.name}")
