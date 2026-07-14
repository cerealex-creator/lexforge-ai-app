import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from apps.api.config import settings
from apps.api.database import DB_UNAVAILABLE_MSG, async_session
from apps.api.routers import activity, auth, companies, comparisons, consulting, contracts, counterparty, documents, litigation, prompts, projects, reference_documents, reviews

app = FastAPI(
    title="LexForge AI API",
    description="LegalTech AI Prototype",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(activity.router, prefix="/api/v1")
app.include_router(companies.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(reviews.router, prefix="/api/v1")
app.include_router(contracts.router, prefix="/api/v1")
app.include_router(counterparty.router, prefix="/api/v1")
app.include_router(consulting.router, prefix="/api/v1")
app.include_router(litigation.router, prefix="/api/v1")
app.include_router(prompts.router, prefix="/api/v1")
app.include_router(comparisons.router, prefix="/api/v1")
app.include_router(reference_documents.router, prefix="/api/v1")


@app.exception_handler(OperationalError)
async def db_operational_error_handler(_request: Request, _exc: OperationalError):
    return JSONResponse(status_code=503, content={"detail": DB_UNAVAILABLE_MSG})


@app.get("/health")
async def health():
    db_ok = True
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "env": settings.app_env,
        "version": "0.9.0",
        "modules": {
            "auth": True,
            "documents": True,
            "reviews": True,
            "prompts": True,
            "comparisons": True,
            "reference_documents": True,
            "deadlines": True,
            "rag": True,
            "contract_generation": True,
            "counterparty_check": True,
            "consulting": True,
            "litigation": True,
            "activity": True,
            "multi_agent_review": True,
            "projects": True,
        },
    }


@app.get("/")
async def root():
    return {"message": "LexForge AI API", "docs": "/docs"}
