"""Dependencies shared by routers, used with FastAPI's Depends()."""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthError

from app.routers.db import get_user_role, supabase

# Rejects a missing or non-Bearer Authorization header with a 401.
bearer = HTTPBearer()


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    role: str


def unauthorized(message):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> CurrentUser:
    """
    The signed-in user for a dashboard request, from its Supabase access token.

    Supabase verifies the token, so expired or signed-out sessions are rejected
    too. The role comes from the platform users table.
    """
    try:
        # get_user with an explicit token doesn't change the shared client's session.
        result = supabase.auth.get_user(credentials.credentials)
    except AuthError as e:
        # Supabase rejects bad or expired tokens with a 4xx. Anything else means we
        # couldn't check the token, which shouldn't sign the user out.
        error_status = getattr(e, "status", None)
        if error_status and 400 <= error_status < 500:
            raise unauthorized("Invalid or expired token")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify token, please try again later",
        )

    if result is None or result.user is None:
        raise unauthorized("Invalid or expired token")

    role = get_user_role(result.user.id)
    if role is None:
        raise unauthorized("No platform account for this user")

    return CurrentUser(id=result.user.id, email=result.user.email, role=role)
