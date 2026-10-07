from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import Response
from pydantic import ValidationError
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

from app.routers.auth import RegisterRequest, ensure_user_row, register

EMAIL = "new@example.com"
PASSWORD = "correct-horse-battery"


def sign_up_result(identities=("email",), session=None):
    user = SimpleNamespace(id="user-123", email=EMAIL, identities=list(identities))
    return SimpleNamespace(user=user, session=session)


def call_register(password=PASSWORD):
    response = Response()
    body = register(RegisterRequest(email=EMAIL, password=password), response)
    return response, body


@pytest.fixture
def auth_client():
    with patch("app.routers.auth.new_auth_client") as factory:
        yield factory.return_value


@pytest.fixture
def db():
    with patch("app.routers.auth.supabase") as shared:
        # By default the upsert creates the row, so it comes back in data.
        set_upsert_rows(shared, [{"id": "user-123", "role": "user"}])
        yield shared


def set_upsert_rows(db, rows):
    db.table.return_value.upsert.return_value.execute.return_value.data = rows


def test_ensure_user_row_uses_default_role_and_keeps_existing_rows(db):
    assert ensure_user_row("user-123") is True

    db.table.assert_called_once_with("users")
    db.table.return_value.upsert.assert_called_once_with(
        {"id": "user-123", "role": "user"}, on_conflict="id", ignore_duplicates=True
    )


def test_ensure_user_row_reports_existing_row(db):
    set_upsert_rows(db, [])

    assert ensure_user_row("user-123") is False


def test_register_signs_up_and_creates_user_row(auth_client, db):
    auth_client.auth.sign_up.return_value = sign_up_result()

    _, body = call_register()

    assert body["status"] == "ok"
    assert body["user_id"] == "user-123"
    assert body["email_confirmation_required"] is True
    auth_client.auth.sign_up.assert_called_once_with(
        {"email": EMAIL, "password": PASSWORD}
    )
    db.table.return_value.upsert.assert_called_once()


def test_register_never_stores_or_returns_password(auth_client, db):
    auth_client.auth.sign_up.return_value = sign_up_result()

    _, body = call_register()

    assert PASSWORD not in str(body)
    assert PASSWORD not in str(db.mock_calls)


def test_register_with_session_needs_no_confirmation(auth_client, db):
    auth_client.auth.sign_up.return_value = sign_up_result(session=MagicMock())

    _, body = call_register()

    assert body["email_confirmation_required"] is False


def test_register_rejects_duplicate_email(auth_client, db):
    auth_client.auth.sign_up.side_effect = AuthApiError(
        "User already registered", 422, "user_already_exists"
    )

    response, _ = call_register()

    assert response.status_code == 409
    db.table.assert_not_called()


def test_register_rejects_duplicate_email_when_confirmation_on(auth_client, db):
    # Supabase hides existing emails behind a fake user with no identities.
    auth_client.auth.sign_up.return_value = sign_up_result(identities=())

    response, _ = call_register()

    assert response.status_code == 409
    db.table.assert_not_called()


def test_register_rejects_duplicate_unconfirmed_email(auth_client, db):
    # Supabase returns the existing unconfirmed user as if the sign-up were new.
    auth_client.auth.sign_up.return_value = sign_up_result()
    set_upsert_rows(db, [])

    response, body = call_register()

    assert response.status_code == 409
    assert body["message"] == "An account with this email already exists"


def test_register_passes_on_weak_password_message(auth_client, db):
    auth_client.auth.sign_up.side_effect = AuthWeakPasswordError(
        "Password should be at least 6 characters.", 422, ["length"]
    )

    response, body = call_register(password="abc")

    assert response.status_code == 422
    assert body["message"] == "Password should be at least 6 characters."
    db.table.assert_not_called()


def test_register_hides_supabase_server_errors(auth_client, db):
    auth_client.auth.sign_up.side_effect = AuthApiError("db exploded", 500, None)

    response, body = call_register()

    assert response.status_code == 500
    assert "exploded" not in body["message"]


def test_register_request_rejects_invalid_email():
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password=PASSWORD)
