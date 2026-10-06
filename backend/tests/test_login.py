from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import Response
from supabase_auth.errors import AuthApiError, AuthRetryableError

from app.routers.auth import LoginRequest, login

EMAIL = "user@example.com"
PASSWORD = "correct-horse-battery"


def sign_in_result():
    user = SimpleNamespace(id="user-123", email=EMAIL)
    session = SimpleNamespace(
        access_token="access-jwt",
        refresh_token="refresh-token",
        expires_in=3600,
        expires_at=1_800_000_000,
    )
    return SimpleNamespace(user=user, session=session)


def call_login(password=PASSWORD):
    response = Response()
    body = login(LoginRequest(email=EMAIL, password=password), response)
    return response, body


@pytest.fixture
def auth_client():
    with patch("app.routers.auth.new_auth_client") as factory:
        yield factory.return_value


@pytest.fixture
def db():
    with patch("app.routers.auth.supabase") as shared, patch(
        "app.routers.auth.get_user_role", return_value="team_lead"
    ):
        yield shared


def test_login_returns_session_and_role(auth_client, db):
    auth_client.auth.sign_in_with_password.return_value = sign_in_result()

    response, body = call_login()

    assert response.status_code == 200
    assert body["access_token"] == "access-jwt"
    assert body["refresh_token"] == "refresh-token"
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert body["user"] == {"id": "user-123", "email": EMAIL, "role": "team_lead"}
    auth_client.auth.sign_in_with_password.assert_called_once_with(
        {"email": EMAIL, "password": PASSWORD}
    )


def test_login_never_uses_shared_client_for_sign_in(auth_client, db):
    auth_client.auth.sign_in_with_password.return_value = sign_in_result()

    call_login()

    db.auth.sign_in_with_password.assert_not_called()


def test_login_creates_missing_user_row(auth_client, db):
    auth_client.auth.sign_in_with_password.return_value = sign_in_result()

    call_login()

    db.table.assert_called_once_with("users")
    db.table.return_value.upsert.assert_called_once_with(
        {"id": "user-123", "role": "user"}, on_conflict="id", ignore_duplicates=True
    )


def test_login_wrong_credentials_give_one_message(auth_client, db):
    auth_client.auth.sign_in_with_password.side_effect = AuthApiError(
        "Invalid login credentials", 400, "invalid_credentials"
    )

    response, body = call_login(password="wrong")

    assert response.status_code == 401
    assert body["message"] == "Invalid email or password"
    db.table.assert_not_called()


def test_login_asks_unconfirmed_users_to_confirm_email(auth_client, db):
    auth_client.auth.sign_in_with_password.side_effect = AuthApiError(
        "Email not confirmed", 400, "email_not_confirmed"
    )

    response, body = call_login()

    assert response.status_code == 403
    assert "confirm your email" in body["message"]


def test_login_passes_on_rate_limit_message(auth_client, db):
    auth_client.auth.sign_in_with_password.side_effect = AuthApiError(
        "Too many requests", 429, "over_request_rate_limit"
    )

    response, body = call_login()

    assert response.status_code == 429
    assert body["message"] == "Too many requests"


def test_login_hides_supabase_server_errors(auth_client, db):
    auth_client.auth.sign_in_with_password.side_effect = AuthRetryableError(
        "upstream exploded", 502
    )

    response, body = call_login()

    assert response.status_code == 500
    assert "exploded" not in body["message"]
