"""Focused tests for the models-list endpoint helpers and access rules."""

import os

# db.py creates the Supabase client during import. These values are sufficient
# because every database access in this module is replaced with a mock.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from fastapi import Response
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app import config

config.SUPABASE_URL = os.environ["SUPABASE_URL"]
config.SUPABASE_KEY = os.environ["SUPABASE_KEY"]

from app.routers import models
from app.main import app


USER_CREDENTIALS = HTTPAuthorizationCredentials(
    scheme="Bearer", credentials="user-token"
)
MODEL_ROW = {
    "id": "00000000-0000-0000-0000-000000000001",
    "alias": "gateway-small",
    "data_processing_country": None,
    "provider": "provider-internal",
    "model": "provider-small-2026",
}


def test_models_route_requires_bearer_authentication():
    response = TestClient(app).get("/models")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_non_admin_response_hides_provider_details(monkeypatch):
    monkeypatch.setattr(models, "get_user_id", lambda token: "user-id")
    monkeypatch.setattr(models, "get_user_role", lambda user_id: "user")
    monkeypatch.setattr(
        models, "get_model_rows", lambda include_provider_details: [MODEL_ROW]
    )

    result = models.list_models(Response(), USER_CREDENTIALS)

    assert result == [
        {
            "id": MODEL_ROW["id"],
            "alias": "gateway-small",
            "data_processing_country": "Not specified",
        }
    ]


def test_admin_response_includes_provider_details(monkeypatch):
    monkeypatch.setattr(models, "get_user_id", lambda token: "admin-id")
    monkeypatch.setattr(models, "get_user_role", lambda user_id: "admin")
    monkeypatch.setattr(
        models, "get_model_rows", lambda include_provider_details: [MODEL_ROW]
    )

    result = models.list_models(Response(), USER_CREDENTIALS)

    assert result == [
        {
            "id": MODEL_ROW["id"],
            "alias": "gateway-small",
            "data_processing_country": "Not specified",
            "provider": "provider-internal",
            "model": "provider-small-2026",
        }
    ]


def test_model_query_selects_only_public_columns_for_non_admins(monkeypatch):
    class FakeQuery:
        def __init__(self):
            self.columns = None
            self.order_by = None

        def select(self, columns):
            self.columns = columns
            return self

        def order(self, column):
            self.order_by = column
            return self

        def execute(self):
            return type("Response", (), {"data": []})()

    class FakeSupabase:
        def __init__(self):
            self.queries = []

        def table(self, table_name):
            assert table_name == "models"
            query = FakeQuery()
            self.queries.append(query)
            return query

    fake_supabase = FakeSupabase()
    monkeypatch.setattr(models, "supabase", fake_supabase)

    assert models.get_model_rows(False) == []
    assert fake_supabase.queries[0].columns == models.PUBLIC_MODEL_COLUMNS
    assert fake_supabase.queries[0].order_by == "alias"

    assert models.get_model_rows(True) == []
    assert fake_supabase.queries[1].columns == models.ADMIN_MODEL_COLUMNS


def test_invalid_token_is_forbidden(monkeypatch):
    response = Response()
    monkeypatch.setattr(models, "get_user_id", lambda token: None)

    result = models.list_models(response, USER_CREDENTIALS)

    assert response.status_code == 403
    assert result == {"message": "Invalid token"}


def test_empty_model_list_is_successful(monkeypatch):
    monkeypatch.setattr(models, "get_user_id", lambda token: "user-id")
    monkeypatch.setattr(models, "get_user_role", lambda user_id: "team_lead")
    monkeypatch.setattr(models, "get_model_rows", lambda include_provider_details: [])

    assert models.list_models(Response(), USER_CREDENTIALS) == []


def test_model_query_failure_does_not_expose_database_error(monkeypatch):
    response = Response()
    monkeypatch.setattr(models, "get_user_id", lambda token: "user-id")
    monkeypatch.setattr(models, "get_user_role", lambda user_id: "user")

    def raise_database_error(include_provider_details):
        raise RuntimeError("database password")

    monkeypatch.setattr(models, "get_model_rows", raise_database_error)

    result = models.list_models(response, USER_CREDENTIALS)

    assert response.status_code == 500
    assert result == {"message": "Failed to retrieve models"}
