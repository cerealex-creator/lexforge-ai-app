from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.dependencies import get_current_user, get_db
from apps.api.schemas_project import (
    JudicialProfileUpdate,
    ProjectAttachDocumentRequest,
    ProjectCreateRequest,
    ProjectFromDocumentRequest,
    ProjectListItemOut,
    ProjectOut,
    ProjectDocumentOut,
    ProjectUpdateRequest,
)
from packages.db.models import (
    Document,
    DocumentTask,
    Project,
    ProjectDocument,
    ProjectDocumentRole,
    ProjectKind,
    ProjectStage,
    ProjectStatus,
    User,
    UserCompanyRole,
)
from services.document_processor.ingest import store_and_parse_upload

router = APIRouter(prefix="/projects", tags=["projects"])


async def _verify_company_access(db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID) -> None:
    result = await db.execute(
        select(UserCompanyRole).where(
            UserCompanyRole.user_id == user_id,
            UserCompanyRole.company_id == company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Нет доступа к компании")


async def _get_project(db: AsyncSession, project_id: uuid.UUID, company_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.documents).selectinload(ProjectDocument.document))
        .where(Project.id == project_id, Project.company_id == company_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


def _doc_out(pd: ProjectDocument) -> ProjectDocumentOut:
    return ProjectDocumentOut(
        id=pd.id,
        document_id=pd.document_id,
        document_title=pd.document.title if pd.document else "Документ",
        role=pd.role.value,
        edition=pd.edition,
        label=pd.label,
        added_at=pd.added_at,
    )


def _project_out(project: Project) -> ProjectOut:
    docs = sorted(project.documents or [], key=lambda d: (d.edition, d.added_at))
    return ProjectOut(
        id=project.id,
        company_id=project.company_id,
        title=project.title,
        kind=project.kind.value,
        status=project.status.value,
        counterparty_name=project.counterparty_name,
        counterparty_inn=project.counterparty_inn,
        industry=project.industry,
        our_position=project.our_position,
        stage=project.stage.value if project.stage else None,
        specificity=project.specificity,
        brief=project.brief,
        judicial_profile=project.judicial_profile,
        memory_json=project.memory_json,
        documents=[_doc_out(d) for d in docs],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("", response_model=list[ProjectListItemOut])
async def list_projects(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    company_id: uuid.UUID,
    status: Optional[str] = "active",
    limit: int = 50,
):
    await _verify_company_access(db, user.id, company_id)
    limit = max(1, min(limit, 100))
    q = select(Project).where(Project.company_id == company_id)
    if status:
        q = q.where(Project.status == ProjectStatus(status))
    q = q.order_by(Project.updated_at.desc()).limit(limit)
    result = await db.execute(q)
    projects = list(result.scalars())

    counts: dict[uuid.UUID, int] = {}
    if projects:
        ids = [p.id for p in projects]
        cnt_result = await db.execute(
            select(ProjectDocument.project_id, func.count())
            .where(ProjectDocument.project_id.in_(ids))
            .group_by(ProjectDocument.project_id)
        )
        counts = {row[0]: row[1] for row in cnt_result.all()}

    return [
        ProjectListItemOut(
            id=p.id,
            title=p.title,
            kind=p.kind.value,
            status=p.status.value,
            counterparty_name=p.counterparty_name,
            counterparty_inn=p.counterparty_inn,
            stage=p.stage.value if p.stage else None,
            document_count=counts.get(p.id, 0),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)
    project = Project(
        company_id=body.company_id,
        title=body.title.strip(),
        kind=ProjectKind(body.kind),
        counterparty_name=body.counterparty_name,
        counterparty_inn=body.counterparty_inn,
        industry=body.industry,
        our_position=body.our_position,
        stage=ProjectStage(body.stage) if body.stage else None,
        specificity=body.specificity,
        brief=body.brief,
        judicial_profile=body.judicial_profile or {"source": "manual", "risk_flags": [], "sources": []},
        memory_json={},
        created_by=user.id,
    )
    db.add(project)
    await db.commit()
    project = await _get_project(db, project.id, body.company_id)
    return _project_out(project)


@router.post("/from-document", response_model=ProjectOut, status_code=201)
async def create_project_from_document(
    body: ProjectFromDocumentRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, body.company_id)
    doc = await db.get(Document, body.document_id)
    if not doc or doc.company_id != body.company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    title = (body.title or doc.title).strip()
    project = Project(
        company_id=body.company_id,
        title=title,
        kind=ProjectKind(body.kind),
        counterparty_name=body.counterparty_name,
        counterparty_inn=body.counterparty_inn,
        industry=body.industry,
        our_position=body.our_position,
        stage=ProjectStage(body.stage) if body.stage else None,
        specificity=body.specificity,
        brief=body.brief,
        judicial_profile={"source": "manual", "risk_flags": [], "sources": []},
        memory_json={},
        created_by=user.id,
    )
    db.add(project)
    await db.flush()
    db.add(
        ProjectDocument(
            project_id=project.id,
            document_id=doc.id,
            role=ProjectDocumentRole(body.role),
            edition=1,
            label="Исходная редакция",
        )
    )
    await db.commit()
    project = await _get_project(db, project.id, body.company_id)
    return _project_out(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)
    project = await _get_project(db, project_id, company_id)
    return _project_out(project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdateRequest,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)
    project = await _get_project(db, project_id, company_id)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"]:
        project.title = data["title"].strip()
    if "status" in data and data["status"]:
        project.status = ProjectStatus(data["status"])
    for field in (
        "counterparty_name",
        "counterparty_inn",
        "industry",
        "our_position",
        "specificity",
        "brief",
        "judicial_profile",
        "memory_json",
    ):
        if field in data:
            setattr(project, field, data[field])
    if "stage" in data:
        project.stage = ProjectStage(data["stage"]) if data["stage"] else None
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    project = await _get_project(db, project_id, company_id)
    return _project_out(project)


@router.put("/{project_id}/judicial-profile", response_model=ProjectOut)
async def update_judicial_profile(
    project_id: uuid.UUID,
    body: JudicialProfileUpdate,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)
    project = await _get_project(db, project_id, company_id)
    profile = dict(project.judicial_profile or {})
    incoming = body.model_dump(exclude_unset=True)
    profile.update(incoming)
    if not profile.get("last_checked_at"):
        profile["last_checked_at"] = datetime.now(timezone.utc).isoformat()
    if not profile.get("source"):
        profile["source"] = "manual"
    project.judicial_profile = profile
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    project = await _get_project(db, project_id, company_id)
    return _project_out(project)


@router.post("/{project_id}/documents", response_model=ProjectOut)
async def attach_document(
    project_id: uuid.UUID,
    body: ProjectAttachDocumentRequest,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_company_access(db, user.id, company_id)
    project = await _get_project(db, project_id, company_id)
    doc = await db.get(Document, body.document_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=404, detail="Документ не найден")

    existing = await db.execute(
        select(ProjectDocument).where(
            ProjectDocument.project_id == project_id,
            ProjectDocument.document_id == body.document_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Документ уже в проекте")

    if body.edition is not None:
        edition = body.edition
    else:
        max_ed = await db.execute(
            select(func.coalesce(func.max(ProjectDocument.edition), 0)).where(
                ProjectDocument.project_id == project_id
            )
        )
        edition = int(max_ed.scalar_one()) + 1

    db.add(
        ProjectDocument(
            project_id=project_id,
            document_id=body.document_id,
            role=ProjectDocumentRole(body.role),
            edition=edition,
            label=body.label,
        )
    )
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    project = await _get_project(db, project_id, company_id)
    return _project_out(project)


@router.post("/{project_id}/documents/upload", response_model=ProjectOut)
async def upload_document_to_project(
    project_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    role: str = Form("ours"),
    label: Optional[str] = Form(None),
    edition: Optional[int] = Form(None),
):
    await _verify_company_access(db, user.id, company_id)
    project = await _get_project(db, project_id, company_id)
    try:
        role_enum = ProjectDocumentRole(role)
    except ValueError as e:
        raise HTTPException(status_code=422, detail="Некорректная роль документа") from e

    doc, _version = await store_and_parse_upload(db, user_id=user.id, company_id=company_id, file=file)

    if edition is None:
        max_ed = await db.execute(
            select(func.coalesce(func.max(ProjectDocument.edition), 0)).where(
                ProjectDocument.project_id == project_id
            )
        )
        edition = int(max_ed.scalar_one()) + 1

    db.add(
        ProjectDocument(
            project_id=project.id,
            document_id=doc.id,
            role=role_enum,
            edition=edition,
            label=label,
        )
    )
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    project = await _get_project(db, project_id, company_id)
    return _project_out(project)


@router.get("/{project_id}/reviews")
async def list_project_reviews(
    project_id: uuid.UUID,
    company_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
):
    await _verify_company_access(db, user.id, company_id)
    await _get_project(db, project_id, company_id)
    limit = max(1, min(limit, 50))
    result = await db.execute(
        select(DocumentTask)
        .where(DocumentTask.project_id == project_id, DocumentTask.company_id == company_id)
        .order_by(DocumentTask.created_at.desc())
        .limit(limit)
    )
    tasks = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "document_id": str(t.document_id),
            "status": t.status.value,
            "review_mode": t.review_mode.value,
            "created_at": t.created_at.isoformat(),
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        }
        for t in tasks
    ]
