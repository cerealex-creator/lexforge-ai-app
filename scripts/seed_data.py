"""Seed admin user and demo companies."""

import asyncio
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apps.api.database import hash_password
from packages.db.models import Company, User, UserCompanyRole, UserRole

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://lexforge:lexforge@localhost:5432/lexforge",
)


async def seed():
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@lexforge.ru")
    admin_password = os.getenv("SEED_ADMIN_PASSWORD", "admin123")

    async with session_factory() as db:
        # Migrate legacy demo email (.local is rejected by EmailStr validator)
        legacy = await db.execute(select(User).where(User.email == "admin@lexforge.local"))
        legacy_user = legacy.scalar_one_or_none()
        if legacy_user:
            legacy_user.email = admin_email
            await db.flush()
            print(f"Migrated admin email to {admin_email}")

        result = await db.execute(select(User).where(User.email == admin_email))
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                id=uuid.uuid4(),
                email=admin_email,
                password_hash=hash_password(admin_password),
                full_name="Администратор LexForge",
            )
            db.add(user)
            await db.flush()
            print(f"Created admin: {admin_email}")
        else:
            print(f"Admin exists: {admin_email}")

        demo_companies = [
            ("ООО «СтройМонтаж»", "7701234567"),
            ("ООО «ТехСнаб»", "7709876543"),
        ]

        for name, inn in demo_companies:
            result = await db.execute(select(Company).where(Company.inn == inn))
            company = result.scalar_one_or_none()
            if not company:
                company = Company(id=uuid.uuid4(), name=name, inn=inn)
                db.add(company)
                await db.flush()
                print(f"Created company: {name}")

            result = await db.execute(
                select(UserCompanyRole).where(
                    UserCompanyRole.user_id == user.id,
                    UserCompanyRole.company_id == company.id,
                )
            )
            if not result.scalar_one_or_none():
                db.add(UserCompanyRole(user_id=user.id, company_id=company.id, role=UserRole.admin))
                print(f"Linked admin to {name}")

        await db.commit()

    await engine.dispose()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
