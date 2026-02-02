from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, inspect, literal
from sqlalchemy.orm import Session
from sqlalchemy import MetaData, Table

from app.database import get_db
from app.models.user import User, UserRole
from app.models.lawyer import Lawyer
from app.models.service_package import ServicePackage
from app.models.branch import Branch
from app.models.booking import Booking
from app.modules.lawyer_profiles.models import LawyerProfile
from app.routers.auth import get_current_user
from app.modules.cases.models import Case

router = APIRouter(prefix="/lawyers", tags=["Lawyers"])


class LawyerSearchItem(BaseModel):
    id: int
    name: str
    district: Optional[str] = None
    city: Optional[str] = None
    specialization: Optional[str] = None
    languages: List[str] = Field(default_factory=list)
    rating: float = 0
    review_count: int = 0
    verified: bool = False
    experience_years: Optional[int] = None
    profile_photo_url: Optional[str] = None
    starting_price: Optional[float] = None
    cases_handled: Optional[int] = None


class LawyerSearchResponse(BaseModel):
    items: List[LawyerSearchItem]
    page: int
    limit: int
    total: int


class ServicePackagePublicOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    price: float
    duration: Optional[int] = None


class ReviewPublicOut(BaseModel):
    id: int
    client_name: str
    rating: float
    comment: Optional[str] = None
    created_at: str


class LawyerPublicProfileOut(BaseModel):
    id: int
    name: str
    verified: bool
    profile_photo_url: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    specialization: Optional[str] = None
    languages: List[str] = Field(default_factory=list)
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    education: Optional[str] = None
    court_admissions: List[str] = Field(default_factory=list)
    office_hours_text: Optional[str] = None
    contact_email: Optional[str] = None
    rating: float = 0
    review_count: int = 0
    cases_handled: Optional[int] = None
    response_time_hours: Optional[int] = None
    service_packages: List[ServicePackagePublicOut] = Field(default_factory=list)
    recent_reviews: List[ReviewPublicOut] = Field(default_factory=list)


@router.get("/")
def list_lawyers(
    district: Optional[str] = None,
    city: Optional[str] = None,
    specialization: Optional[str] = None,
    language: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List lawyers from profiles joined with users, with optional filters."""
    query = (
        db.query(User, LawyerProfile)
        .join(LawyerProfile, LawyerProfile.user_id == User.id)
        .filter(User.role == UserRole.lawyer)
    )

    filters = []
    if district:
        filters.append(LawyerProfile.district.ilike(f"%{district}%"))
    if city:
        filters.append(LawyerProfile.city.ilike(f"%{city}%"))
    if specialization:
        filters.append(LawyerProfile.specialization.ilike(f"%{specialization}%"))
    if language:
        filters.append(LawyerProfile.languages.contains([language]))
    if q:
        filters.append(User.full_name.ilike(f"%{q}%"))

    if filters:
        query = query.filter(and_(*filters))

    results = []
    for user, profile in query.all():
        results.append(
            {
                "id": user.id,  # IMPORTANT: this is users.id (used by your client routes)
                "full_name": user.full_name,
                "specialization": profile.specialization,
                "district": profile.district,
                "city": profile.city,
                "languages": profile.languages,
                "rating": profile.rating,
            }
        )
    return results


@router.get("/search", response_model=LawyerSearchResponse)
def search_lawyers(
    q: Optional[str] = Query(None, description="Search by lawyer name"),
    district: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    specialization: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    min_rating: Optional[float] = Query(None, ge=0),
    verified: Optional[bool] = Query(None),
    sort: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base_query = (
        db.query(User, LawyerProfile)
        .join(LawyerProfile, LawyerProfile.user_id == User.id)
        .filter(User.role == UserRole.lawyer)
    )

    filters = []
    if q:
        filters.append(User.full_name.ilike(f"%{q}%"))
    if district:
        filters.append(LawyerProfile.district.ilike(f"%{district}%"))
    if city:
        filters.append(LawyerProfile.city.ilike(f"%{city}%"))
    if specialization:
        filters.append(LawyerProfile.specialization.ilike(f"%{specialization}%"))
    if language:
        filters.append(LawyerProfile.languages.contains([language]))
    if verified is not None:
        filters.append(LawyerProfile.is_verified.is_(verified))
    if filters:
        base_query = base_query.filter(and_(*filters))

    total = base_query.count()

    engine = db.get_bind()
    inspector = inspect(engine)

    review_subq = None
    if inspector.has_table("reviews"):
        reviews = Table("reviews", MetaData(), autoload_with=engine)
        review_id_col = reviews.c.get("user_id") or reviews.c.get("lawyer_id")
        if review_id_col is not None and "rating" in reviews.c and "id" in reviews.c:
            review_subq = (
                db.query(
                    review_id_col.label("lawyer_user_id"),
                    func.avg(reviews.c.rating).label("avg_rating"),
                    func.count(reviews.c.id).label("review_count"),
                )
                .group_by(review_id_col)
                .subquery()
            )

    price_subq = None
    if inspector.has_table("service_packages") and inspector.has_table("lawyers"):
        lawyer_map = db.query(
            Lawyer.id.label("lawyer_id"),
            Lawyer.user_id.label("user_id"),
        ).subquery()
        price_subq = (
            db.query(
                lawyer_map.c.user_id.label("user_id"),
                func.min(ServicePackage.price).label("starting_price"),
            )
            .join(ServicePackage, ServicePackage.lawyer_id == lawyer_map.c.lawyer_id)
            .group_by(lawyer_map.c.user_id)
            .subquery()
        )

    cases_subq = None
    if inspector.has_table("bookings"):
        cases_subq = (
            db.query(
                Booking.lawyer_id.label("lawyer_user_id"),
                func.count(Booking.id).label("cases_handled"),
            )
            .filter(func.lower(Booking.status).in_(["confirmed", "completed"]))
            .group_by(Booking.lawyer_id)
            .subquery()
        )

    rating_expr = (
        func.coalesce(review_subq.c.avg_rating, 0.0) if review_subq is not None else literal(0.0)
    ).label("rating")
    review_count_expr = (
        func.coalesce(review_subq.c.review_count, 0) if review_subq is not None else literal(0)
    ).label("review_count")
    starting_price_expr = (
        price_subq.c.starting_price if price_subq is not None else literal(None)
    ).label("starting_price")
    cases_handled_expr = (
        cases_subq.c.cases_handled if cases_subq is not None else literal(None)
    ).label("cases_handled")

    data_query = base_query
    if review_subq is not None:
        data_query = data_query.outerjoin(review_subq, review_subq.c.lawyer_user_id == User.id)
    if price_subq is not None:
        data_query = data_query.outerjoin(price_subq, price_subq.c.user_id == User.id)
    if cases_subq is not None:
        data_query = data_query.outerjoin(cases_subq, cases_subq.c.lawyer_user_id == User.id)

    data_query = data_query.add_columns(
        rating_expr,
        review_count_expr,
        starting_price_expr,
        cases_handled_expr,
    )

    if min_rating is not None:
        data_query = data_query.filter(rating_expr >= min_rating)

    sort_value = (sort or "").lower()
    if sort_value == "rating_desc":
        data_query = data_query.order_by(rating_expr.desc().nullslast())
    elif sort_value == "experience_desc":
        data_query = data_query.order_by(LawyerProfile.years_of_experience.desc().nullslast())
    elif sort_value == "price_asc":
        data_query = data_query.order_by(starting_price_expr.asc().nullslast())
    elif sort_value == "price_desc":
        data_query = data_query.order_by(starting_price_expr.desc().nullslast())
    elif sort_value == "newest":
        data_query = data_query.order_by(LawyerProfile.created_at.desc().nullslast())
    else:
        data_query = data_query.order_by(LawyerProfile.created_at.desc().nullslast())

    offset = (page - 1) * limit
    rows = data_query.offset(offset).limit(limit).all()

    items: List[LawyerSearchItem] = []
    for user, profile, rating, review_count, starting_price, cases_handled in rows:
        photo_url = getattr(profile, "photo_url", None) or getattr(profile, "profile_photo_url", None)
        items.append(
            LawyerSearchItem(
                id=user.id,
                name=user.full_name,
                district=profile.district,
                city=profile.city,
                specialization=profile.specialization,
                languages=profile.languages or [],
                rating=float(rating or 0),
                review_count=int(review_count or 0),
                verified=bool(profile.is_verified),
                experience_years=profile.years_of_experience,
                profile_photo_url=photo_url,
                starting_price=float(starting_price) if starting_price is not None else None,
                cases_handled=int(cases_handled) if cases_handled is not None else None,
            )
        )

    return LawyerSearchResponse(items=items, page=page, limit=limit, total=total)


@router.get("/{lawyer_id}")
def get_lawyer_profile(lawyer_id: int, db: Session = Depends(get_db)):
    """Return DB-backed profile data for a lawyer."""
    user_profile = (
        db.query(User, LawyerProfile)
        .join(LawyerProfile, LawyerProfile.user_id == User.id)
        .filter(User.id == lawyer_id, User.role == UserRole.lawyer)
        .first()
    )

    if not user_profile:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    user, profile = user_profile

    return {
        "id": user.id,
        "full_name": user.full_name,
        "specialization": profile.specialization,
        "district": profile.district,
        "city": profile.city,
        "languages": profile.languages,
        "years_of_experience": profile.years_of_experience,
        "is_verified": profile.is_verified,
        "bio": profile.bio,
        "rating": profile.rating,
        "branches": [],
        "reviews": [],
    }


@router.get("/{lawyer_id}/profile", response_model=LawyerPublicProfileOut)
def get_lawyer_public_profile(lawyer_id: int, db: Session = Depends(get_db)):
    user_profile = (
        db.query(User, LawyerProfile)
        .join(LawyerProfile, LawyerProfile.user_id == User.id)
        .filter(User.id == lawyer_id, User.role == UserRole.lawyer)
        .first()
    )

    if not user_profile:
        raise HTTPException(status_code=404, detail="Lawyer not found")

    user, profile = user_profile

    engine = db.get_bind()
    inspector = inspect(engine)

    rating_value = 0.0
    review_count = 0
    recent_reviews: List[ReviewPublicOut] = []

    if inspector.has_table("reviews"):
        reviews = Table("reviews", MetaData(), autoload_with=engine)
        lawyer_id_col = reviews.c.get("lawyer_id") or reviews.c.get("user_id")
        rating_col = reviews.c.get("rating")
        review_id_col = reviews.c.get("id")
        created_at_col = reviews.c.get("created_at") or literal(None)
        comment_col = reviews.c.get("comment") or literal(None)

        if lawyer_id_col is not None and rating_col is not None and review_id_col is not None:
            rating_row = (
                db.query(func.avg(rating_col), func.count(review_id_col))
                .filter(lawyer_id_col == user.id)
                .first()
            )
            if rating_row:
                rating_value = float(rating_row[0] or 0)
                review_count = int(rating_row[1] or 0)

            client_name_col = reviews.c.get("client_name")
            client_id_col = reviews.c.get("client_id")

            if client_name_col is not None:
                name_expr = client_name_col
                review_query = db.query(
                    review_id_col,
                    rating_col,
                    comment_col,
                    created_at_col,
                    name_expr.label("client_name"),
                )
            elif client_id_col is not None:
                review_query = (
                    db.query(
                        review_id_col,
                        rating_col,
                        comment_col,
                        created_at_col,
                        User.full_name.label("client_name"),
                    )
                    .join(User, User.id == client_id_col)
                )
            else:
                review_query = db.query(
                    review_id_col,
                    rating_col,
                    comment_col,
                    created_at_col,
                    literal("Anonymous").label("client_name"),
                )

            review_query = review_query.filter(lawyer_id_col == user.id)
            if created_at_col is not None and hasattr(created_at_col, "desc"):
                review_query = review_query.order_by(created_at_col.desc())
            else:
                review_query = review_query.order_by(review_id_col.desc())

            for row in review_query.limit(5).all():
                recent_reviews.append(
                    ReviewPublicOut(
                        id=int(row[0]),
                        client_name=str(row[4] or "Anonymous"),
                        rating=float(row[1] or 0),
                        comment=row[2],
                        created_at=str(row[3]) if row[3] is not None else "",
                    )
                )

    service_packages: List[ServicePackagePublicOut] = []
    if inspector.has_table("service_packages") and inspector.has_table("lawyers"):
        lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == user.id).first()
        if lawyer_row:
            packages = (
                db.query(ServicePackage)
                .filter(ServicePackage.lawyer_id == lawyer_row.id)
                .filter(ServicePackage.active == True)
                .order_by(ServicePackage.id.asc())
                .all()
            )
            for pkg in packages:
                service_packages.append(
                    ServicePackagePublicOut(
                        id=pkg.id,
                        name=pkg.name,
                        description=pkg.description,
                        price=float(pkg.price),
                        duration=pkg.duration,
                    )
                )

    cases_handled = None
    if inspector.has_table("bookings"):
        cases_handled = (
            db.query(func.count(Booking.id))
            .filter(Booking.lawyer_id == user.id)
            .filter(func.lower(Booking.status).in_(["confirmed", "completed"]))
            .scalar()
        )
    elif inspector.has_table("cases"):
        cases_handled = (
            db.query(func.count(Case.id))
            .filter(Case.selected_lawyer_id == user.id)
            .scalar()
        )

    photo_url = getattr(profile, "photo_url", None) or getattr(profile, "profile_photo_url", None)
    return LawyerPublicProfileOut(
        id=user.id,
        name=user.full_name,
        verified=bool(profile.is_verified),
        profile_photo_url=photo_url,
        district=profile.district,
        city=profile.city,
        specialization=profile.specialization,
        languages=profile.languages or [],
        experience_years=profile.years_of_experience,
        bio=profile.bio,
        education=None,
        court_admissions=[],
        office_hours_text=None,
        contact_email=None,
        rating=rating_value,
        review_count=review_count,
        cases_handled=int(cases_handled) if cases_handled is not None else None,
        response_time_hours=None,
        service_packages=service_packages,
        recent_reviews=recent_reviews,
    )


@router.get("/by-user/{user_id}")
def get_lawyer_by_user_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Map a users.id to the corresponding lawyer profile (users.id is the public lawyer id)."""
    if current_user.role not in {UserRole.client, UserRole.lawyer, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Not authorized")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    lawyer = db.query(Lawyer).filter(Lawyer.user_id == user.id).first()
    if not lawyer:
        raise HTTPException(status_code=404, detail="Lawyer profile not found for this user")

    return {"lawyer_id": user.id, "email": user.email}


@router.get("/{lawyer_id}/service-packages")
def get_service_packages_for_lawyer(
    lawyer_id: int,
    db: Session = Depends(get_db),
):
    """Return ACTIVE service packages for a given users.id."""
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == lawyer_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=404, detail="Lawyer profile not found")
    packages = (
        db.query(ServicePackage)
        .filter(ServicePackage.lawyer_id == lawyer_row.id)
        .filter(ServicePackage.active == True)
        .order_by(ServicePackage.id.asc())
        .all()
    )

    return [
        {
            "id": p.id,
            "lawyer_id": lawyer_id,
            "name": p.name,
            "description": p.description,
            "price": float(p.price),
            "duration": p.duration,
            "active": p.active,
        }
        for p in packages
    ]


@router.get("/{lawyer_id}/branches")
def get_branches_for_lawyer(
    lawyer_id: int,
    db: Session = Depends(get_db),
):
    """Return branches for a given users.id lawyer."""
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == lawyer_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=404, detail="Lawyer profile not found")
    branches = (
        db.query(Branch)
        .filter(Branch.user_id == lawyer_id)
        .order_by(Branch.id.asc())
        .all()
    )
    return [
        {
            "id": b.id,
            "name": b.name,
            "district": b.district,
            "city": b.city,
            "address": b.address,
        }
        for b in branches
    ]
