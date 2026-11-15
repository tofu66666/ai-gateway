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


# Audit filters reuse the dashboard authentication fixtures above.
AUDIT_TARGET_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"


@pytest.fixture
def audit_db(db):
    with patch("app.routers.audit.supabase") as shared:
        query = shared.table.return_value.select.return_value
        for method in ("eq", "in_", "gte", "lte", "order"):
            getattr(query, method).return_value = query
        row = {
            "id": "audit-1",
            "user_id": "user-123",
            "action": "model_modify",
            "target_id": AUDIT_TARGET_ID,
            "details": {},
            "created_at": "2026-11-15T00:00:00+00:00",
        }
        query.execute.return_value.data = [row]
        shared.auth.admin.list_users.return_value = [user_response().user]
        yield SimpleNamespace(client=shared, query=query, row=row)


@pytest.mark.parametrize(
    "field,actions",
    [
        (
            "team_id",
            ["team_create", "team_modify", "team_modify_owner", "team_add_user", "team_remove_user"],
        ),
        ("model_id", ["model_create", "model_modify"]),
    ],
)
def test_audit_resource_filter_builds_query(audit_db, field, actions):
    row = {**audit_db.row, "action": actions[0]}
    audit_db.query.execute.return_value.data = [row]

    response = client.get(
        "/audit_logs", headers=AUTH_HEADER, params={field: AUDIT_TARGET_ID.upper()}
    )

    assert response.status_code == 200
    assert response.json() == [{**row, "user_email": "a@example.com"}]
    audit_db.client.table.assert_called_once_with("audits")
    audit_db.query.in_.assert_called_once_with("action", actions)
    audit_db.query.eq.assert_called_once_with("target_id", AUDIT_TARGET_ID)
    audit_db.query.order.assert_called_once_with("created_at", desc=True)


def test_audit_logs_without_resource_filters(audit_db):
    response = client.get("/audit_logs", headers=AUTH_HEADER)

    assert response.status_code == 200
    assert response.json() == [{**audit_db.row, "user_email": "a@example.com"}]
    audit_db.query.in_.assert_not_called()
    audit_db.query.eq.assert_not_called()
    audit_db.query.order.assert_called_once_with("created_at", desc=True)


@pytest.mark.parametrize("field", ["team_id", "model_id"])
def test_audit_resource_filter_rejects_invalid_uuid(audit_db, field):
    response = client.get(
        "/audit_logs", headers=AUTH_HEADER, params={field: "not-a-uuid"}
    )

    assert response.status_code == 422
    audit_db.client.table.assert_not_called()
    audit_db.client.auth.admin.list_users.assert_not_called()


def test_audit_resource_filters_together_return_empty(audit_db):
    response = client.get(
        "/audit_logs", headers=AUTH_HEADER,
        params={"team_id": AUDIT_TARGET_ID, "model_id": AUDIT_TARGET_ID},
    )

    assert response.status_code == 200
    assert response.json() == []
    audit_db.client.table.assert_not_called()
    audit_db.client.auth.admin.list_users.assert_not_called()


@pytest.mark.parametrize("role", ["user", "team_lead"])
@pytest.mark.parametrize(
    "params",
    [
        {"team_id": AUDIT_TARGET_ID},
        {"model_id": AUDIT_TARGET_ID},
        {"team_id": AUDIT_TARGET_ID, "model_id": AUDIT_TARGET_ID},
    ],
)
def test_audit_resource_filter_preserves_admin_requirement(db, audit_db, role, params):
    db.get_role.return_value = role

    response = client.get("/audit_logs", headers=AUTH_HEADER, params=params)

    assert response.status_code == 403
    audit_db.client.table.assert_not_called()
    audit_db.client.auth.admin.list_users.assert_not_called()


def test_audit_resource_filter_requires_authentication(audit_db):
    response = client.get("/audit_logs", params={"model_id": AUDIT_TARGET_ID})

    assert response.status_code == 401
    audit_db.client.table.assert_not_called()


@pytest.mark.parametrize("field", [None, "team_id", "model_id"])
def test_audit_resource_filter_combines_with_existing_filters(audit_db, field):
    action = "team_modify" if field == "team_id" else "model_modify"
    row = {**audit_db.row, "action": action, "created_at": "1970-01-01T00:00:00+00:00"}
    audit_db.query.execute.return_value.data = [row, {**row, "user_id": "other-user"}]
    params = {"action": action, "user_email": "A@EXAMPLE.COM", "start": 0, "end": 1}
    if field is not None:
        params[field] = AUDIT_TARGET_ID

    response = client.get("/audit_logs", headers=AUTH_HEADER, params=params)

    assert response.status_code == 200
    assert response.json() == [{**row, "user_email": "a@example.com"}]
    audit_db.query.eq.assert_any_call("action", action)
    if field is not None:
        audit_db.query.eq.assert_any_call("target_id", AUDIT_TARGET_ID)
        audit_db.query.in_.assert_called_once()
    else:
        audit_db.query.in_.assert_not_called()
    audit_db.query.gte.assert_called_once_with("created_at", "1970-01-01T00:00:00Z")
    audit_db.query.lte.assert_called_once_with("created_at", "1970-01-01T00:00:01Z")
    audit_db.query.order.assert_called_once_with("created_at", desc=True)
    audit_db.client.auth.admin.list_users.assert_called_once_with(per_page=1000)


@pytest.mark.parametrize("field", ["team_id", "model_id"])
def test_audit_resource_filter_without_matches(audit_db, field):
    audit_db.query.execute.return_value.data = []

    response = client.get(
        "/audit_logs", headers=AUTH_HEADER, params={field: AUDIT_TARGET_ID}
    )

    assert response.status_code == 200
    assert response.json() == []
