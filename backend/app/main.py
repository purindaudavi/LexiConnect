# backend/app/main.py

# Load environment variables first
from dotenv import load_dotenv

load_dotenv()

import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

# Core DB
from .database import SessionLocal, engine

# ✅ IMPORTANT: ensure Specialization model is registered before Case mapper config
from app.models.specialization import Specialization  # noqa: F401

# Ensure models are loaded (so Alembic / SQLAlchemy sees them)
from .models import (  # noqa: F401
    branch,
    kyc_submission,
    lawyer,
    lawyer_availability,
    service_package,
    checklist_template,
)

# ✅ Ensure module models are loaded (cases depends on specialization mapping)
from app.modules.cases import models as case_models  # noqa: F401

# Seed
from app.seed import seed_all

# ---------------------------
# Routers (legacy + modules)
# ---------------------------

# OK Checklist Answers module router
from app.modules.checklist_answers.router import (  # noqa: E402
    router as checklist_answers_router,
    booking_checklist_router,
)

# Legacy routers
from .routers import admin, auth, bookings, dev, lawyers, token_queue, users  # noqa: F401, E402
from .routers import apprentices  # noqa: F401, E402
from .routers import admin_overview  # noqa: F401, E402
from app.routers.lawyer_cases import router as lawyer_cases_router  # noqa: E402
from app.routers.lawyer_availability import router as lawyer_availability_router  # noqa: E402

# Module routers
from app.modules.kyc.router import router as kyc_router  # noqa: E402
from app.modules.kyc.router import admin_router as admin_kyc_router  # noqa: E402
from app.modules.branches.router import router as branches_router  # noqa: E402
from app.modules.service_packages.router import router as service_packages_router  # noqa: E402
from app.modules.checklist_templates.router import router as checklist_router  # noqa: E402
from app.modules.availability.router import router as availability_router  # noqa: E402
from app.modules.blackouts.router import router as blackouts_router  # noqa: E402
from app.modules.apprenticeship.router import router as apprenticeship_router  # noqa: E402
from app.modules.queue.router import router as queue_router  # noqa: E402
from app.modules.lawyer_dashboard.routes import router as lawyer_dashboard_router  # noqa: E402
from app.modules.documents.routes import router as documents_router  # noqa: E402
from app.modules.documents.routes import booking_router as booking_documents_router  # noqa: E402
from app.modules.documents.routes import cases_router as cases_documents_router  # noqa: E402
from app.modules.disputes.routes import (  # noqa: E402
    router as disputes_router,
    admin_router as admin_disputes_router,
    booking_router as booking_disputes_router,
)
from app.modules.case_files.router import router as case_files_router  # noqa: E402
from app.modules.lawyer_profiles.routes import router as lawyer_profiles_router  # noqa: E402
from app.modules.audit_log.routes import router as audit_log_router  # noqa: E402
from app.modules.intake.routes import router as intake_router  # noqa: E402
from app.modules.cases.routes import router as cases_router  # noqa: E402
from app.modules.specializations.routes import router as specializations_router  # noqa: E402
from app.modules.rbac.routes import router as rbac_router  # noqa: E402

# API v1 routers
from .api.v1 import admin as admin_v1, booking as booking_v1  # noqa: E402

# ---------------------------
# FastAPI app
# ---------------------------
app = FastAPI(
    title="LexiConnect API",
    version="0.1.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

# ✅ Serve uploaded files so frontend can open PDFs/images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ---------------------------
# CORS (DEV-SAFE)
# ---------------------------
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,  # keep false unless using cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ---------------------------
# DB wait + seed
# ---------------------------
def wait_for_db(max_attempts: int = 10, delay_seconds: float = 1.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)


@app.on_event("startup")
def startup():
    wait_for_db()
    db = SessionLocal()
    try:
        seed_all(db)
    finally:
        db.close()


# ---------------------------
# Health check
# ---------------------------
@app.get("/health")
def health_check():
    return {"status": "ok"}


# ---------------------------
# Router includes
# ---------------------------

# ✅ Auth (also /api parity)
app.include_router(auth.router)
app.include_router(auth.router, prefix="/api")

# ✅ Users (also /api parity)  <-- fixes /api/users/me
app.include_router(users.router)
app.include_router(users.router, prefix="/api")

# ✅ Lawyers (also /api parity)
app.include_router(lawyers.router)
app.include_router(lawyers.router, prefix="/api")

# ✅ Lawyer cases (explicit /api)
app.include_router(lawyer_cases_router, prefix="/api")

# ✅ Apprentices (search) (kept as you had)
app.include_router(apprentices.router, prefix="/api")

# ✅ Bookings + Token queue (kept as you had; do NOT double-prefix blindly)
app.include_router(bookings.router)
app.include_router(token_queue.router)
app.include_router(token_queue.router, prefix="/api")

# ✅ Apprenticeship (main include adds /api)
app.include_router(apprenticeship_router, prefix="/api")

# ✅ Queue (router already uses /api/queue)
app.include_router(queue_router)

# ✅ Lawyer dashboard (explicit /api)
app.include_router(lawyer_dashboard_router, prefix="/api")

# ✅ Documents router MUST be included ONCE
# NOTE: documents_router already has prefix="/api/documents" in its own file.
app.include_router(documents_router)
app.include_router(booking_documents_router)
app.include_router(cases_documents_router)

# ✅ Checklist answers routers
app.include_router(checklist_answers_router)
app.include_router(booking_checklist_router)

# ✅ Feature modules
app.include_router(service_packages_router)
app.include_router(checklist_router)

# ✅ Admin / Dev / Overview / Branches / Availability / Blackouts / KYC
app.include_router(admin.router)
app.include_router(dev.router)
app.include_router(admin_overview.router)
app.include_router(branches_router)
app.include_router(availability_router)
app.include_router(blackouts_router)
app.include_router(kyc_router)

# ✅ Disputes + Intake + Case files + Audit log + Lawyer profiles + Admin KYC
app.include_router(disputes_router)
app.include_router(admin_disputes_router)
app.include_router(booking_disputes_router)
app.include_router(intake_router)
app.include_router(case_files_router)
app.include_router(audit_log_router)
app.include_router(lawyer_profiles_router)
app.include_router(admin_kyc_router)

# ✅ Dedicated includes
app.include_router(lawyer_availability_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(specializations_router, prefix="/api")
app.include_router(rbac_router)

# ✅ API v1 routers
app.include_router(admin_v1.router)
app.include_router(booking_v1.router)

# ---------------------------
# Custom OpenAPI (JWT Bearer Auth in Swagger)
# ---------------------------
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description="LexiConnect backend API",
        routes=app.routes,
    )

    openapi_schema.setdefault("components", {})
    openapi_schema["components"].setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }

    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return openapi_schema


app.openapi = custom_openapi

# ---------------------------
# Root + favicon helpers
# ---------------------------
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204, media_type="image/x-icon")
