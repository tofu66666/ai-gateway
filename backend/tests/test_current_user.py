from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError, AuthRetryableError

from app.main import app

client = TestClient(app)

AUTH_HEADER = {"Authorization": "Bearer access-jwt"}


def user_response():
    return SimpleNamespace(user=SimpleNamespace(id="user-123", email="a@example.com"))


@pytest.fixture
def db():
    with patch("app.dependencies.supabase") as shared, patch(
        "app.dependencies.get_user_role", return_value="admin"
    ) as get_role:
        shared.auth.get_user.return_value = user_response()
        yield SimpleNamespace(supabase=shared, get_role=get_role)


def test_me_returns_user_and_role_from_token(db):
    response = client.get("/me", headers=AUTH_HEADER)

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-123",
        "email": "a@example.com",
        "role": "admin",
    }
    db.supabase.auth.get_user.assert_called_once_with("access-jwt")
    db.get_role.assert_called_once_with("user-123")


def test_missing_token_is_401(db):
    response = client.get("/me")

    assert response.status_code == 401
    db.supabase.auth.get_user.assert_not_called()


def test_non_bearer_token_is_401(db):
    response = client.get("/me", headers={"Authorization": "Basic abc"})

    assert response.status_code == 401


@pytest.mark.parametrize(
    "error",
    [
        AuthApiError("invalid JWT: token is expired", 403, "bad_jwt"),
        AuthApiError("Session not found", 403, "session_not_found"),
        AuthApiError("no authorization", 401, "no_authorization"),
    ],
)
def test_invalid_or_expired_token_is_401(db, error):
    db.supabase.auth.get_user.side_effect = error

    response = client.get("/me", headers=AUTH_HEADER)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    db.get_role.assert_not_called()


def test_token_without_platform_account_is_401(db):
    db.get_role.return_value = None

    response = client.get("/me", headers=AUTH_HEADER)

    assert response.status_code == 401


def test_supabase_outage_is_503_not_401(db):
    # Supabase being down shouldn't make the dashboard sign everyone out.
    db.supabase.auth.get_user.side_effect = AuthRetryableError("timeout", 504)

    response = client.get("/me", headers=AUTH_HEADER)

    assert response.status_code == 503
