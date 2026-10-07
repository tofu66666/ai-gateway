from fastapi import APIRouter, Response, status
from pydantic import BaseModel, EmailStr
from supabase import create_client
from supabase_auth.errors import AuthError

from app import config
from app.routers.db import supabase

router = APIRouter(tags=["auth"])

DEFAULT_ROLE = "user"
DUPLICATE_EMAIL_CODES = {"user_already_exists", "email_exists"}
DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


def new_auth_client():
    """
    A throwaway Supabase client for sign-up / sign-in calls.

    A successful sign-up or sign-in makes a client send that user's token on every
    later query, so these calls must never go through the shared `supabase` client.
    """
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)


def ensure_user_row(user_id):
    """
    Create the platform users row for a Supabase user, with the default role,
    if it doesn't exist yet. Safe to call on every sign-in.

    Returns True if a row was created, False if one already existed.
    """
    result = (
        supabase.table("users")
        .upsert(
            {"id": user_id, "role": DEFAULT_ROLE},
            on_conflict="id",
            ignore_duplicates=True,
        )
        .execute()
    )
    # Rows skipped as duplicates aren't returned.
    return bool(result.data)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response):
    """
    Register with email and password. Supabase Auth stores the password;
    the platform only keeps a users row linked to the Supabase user id.
    """
    try:
        result = new_auth_client().auth.sign_up(
            {"email": payload.email, "password": payload.password}
        )
    except AuthError as e:
        if e.code in DUPLICATE_EMAIL_CODES:
            response.status_code = status.HTTP_409_CONFLICT
            return {"message": DUPLICATE_EMAIL_MESSAGE}
        # Supabase's 4xx messages (weak password, invalid email, rate limit) are
        # safe to show the user; anything else is our problem, not theirs.
        error_status = getattr(e, "status", None)
        if error_status and 400 <= error_status < 500:
            response.status_code = error_status
            return {"message": e.message}
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Registration failed, please try again later"}

    # With email confirmation on, Supabase doesn't error on an existing email:
    # it returns a fake user with no identities instead.
    if result.user is None or not result.user.identities:
        response.status_code = status.HTTP_409_CONFLICT
        return {"message": DUPLICATE_EMAIL_MESSAGE}

    # Re-registering an unconfirmed email returns the existing user (and resends
    # the confirmation email), so an existing users row means a duplicate.
    if not ensure_user_row(result.user.id):
        response.status_code = status.HTTP_409_CONFLICT
        return {"message": DUPLICATE_EMAIL_MESSAGE}

    confirmation_required = result.session is None
    return {
        "status": "ok",
        "user_id": result.user.id,
        "email": result.user.email,
        "email_confirmation_required": confirmation_required,
        "message": (
            "Registration successful, check your email to confirm your account"
            if confirmation_required
            else "Registration successful"
        ),
    }
