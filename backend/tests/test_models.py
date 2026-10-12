"""Focused tests for the models-list endpoint helpers and access rules."""

import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# db.py creates the Supabase client during import. These values are sufficient
# because every database access in this module is replaced with a mock.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from fastapi import HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import config

config.SUPABASE_URL = os.environ["SUPABASE_URL"]
config.SUPABASE_KEY = os.environ["SUPABASE_KEY"]

from app.routers import models
from app.dependencies import CurrentUser
from app.main import app


USER_CREDENTIALS = HTTPAuthorizationCredentials(
    scheme="Bearer", credentials="user-token"
)
MODEL_ROW = {
    "id": "00000000-0000-0000-0000-000000000001",
    "alias": "gateway-small",
    "price_per_1m_input": "0.250000",
    "price_per_1m_output": "1.000000",
    "data_processing_country": None,
    "data_processing_state": None,
    "provider": "provider-internal",
    "model": "provider-small-2026",
}
ADMIN = CurrentUser(id="admin-id", email="admin@example.com", role="admin")
USER = CurrentUser(id="user-id", email="user@example.com", role="user")


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
            "price_per_1m_input": "0.250000",
            "price_per_1m_output": "1.000000",
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
            "price_per_1m_input": "0.250000",
            "price_per_1m_output": "1.000000",
            "data_processing_country": "Not specified",
            "provider": "provider-internal",
            "model": "provider-small-2026",
            "data_processing_state": None,
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


def model_payload(**overrides):
    values = {
        "alias": " gateway-small ",
        "provider": "provider-internal",
        "model": "provider-small-2026",
        "price_per_1m_input": "0.25",
        "price_per_1m_output": "1.00",
        "data_processing_country": "AU",
        "data_processing_state": "NSW",
    }
    values.update(overrides)
    return models.ModelCreateRequest(**values)


def test_create_route_requires_bearer_authentication():
    response = TestClient(app).post(
        "/models",
        json={
            "alias": "gateway-small",
            "provider": "provider-internal",
            "model": "provider-small-2026",
            "price_per_1m_input": "0.25",
            "price_per_1m_output": "1.00",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_admin_can_create_model(monkeypatch):
    payload = model_payload()
    created = {
        "id": "00000000-0000-0000-0000-000000000001",
        **models.build_model_data(payload),
        "created_at": "2026-10-10T00:00:00+00:00",
    }
    insert_model = MagicMock(return_value=created)
    monkeypatch.setattr(models, "insert_model", insert_model)

    result = models.create_model(payload, ADMIN)

    assert result == created
    insert_model.assert_called_once_with(
        {
            "alias": "gateway-small",
            "provider": "provider-internal",
            "model": "provider-small-2026",
            "price_per_1m_input": "0.25",
            "price_per_1m_output": "1.00",
            "data_processing_country": "AU",
            "data_processing_state": "NSW",
        }
    )


def test_non_admin_cannot_create_model():
    with pytest.raises(HTTPException) as error:
        models.create_model(model_payload(), USER)

    assert error.value.status_code == 403
    assert error.value.detail == "Only administrators can add models"


def test_duplicate_alias_returns_conflict(monkeypatch):
    duplicate = RuntimeError("duplicate key value violates unique constraint")
    duplicate.code = "23505"
    monkeypatch.setattr(models, "insert_model", MagicMock(side_effect=duplicate))

    with pytest.raises(HTTPException) as error:
        models.create_model(model_payload(), ADMIN)

    assert error.value.status_code == 409
    assert error.value.detail == "A model with this alias already exists"


@pytest.mark.parametrize(
    "field,value",
    [
        ("alias", "   "),
        ("price_per_1m_input", "-0.01"),
        ("price_per_1m_output", "0.0000001"),
        ("price_per_1m_output", "1000000"),
    ],
)
def test_create_payload_rejects_invalid_values(field, value):
    with pytest.raises(ValidationError):
        model_payload(**{field: value})


def test_database_error_is_hidden(monkeypatch):
    monkeypatch.setattr(
        models,
        "insert_model",
        MagicMock(side_effect=RuntimeError("database password")),
    )

    with pytest.raises(HTTPException) as error:
        models.create_model(model_payload(), ADMIN)

    assert error.value.status_code == 500
    assert error.value.detail == "Failed to add model"


def test_insert_model_returns_created_row(monkeypatch):
    created = {"id": "model-id", "alias": "gateway-small"}
    query = MagicMock()
    query.insert.return_value.select.return_value.execute.return_value = SimpleNamespace(
        data=[created]
    )
    database = MagicMock()
    database.table.return_value = query
    monkeypatch.setattr(models, "supabase", database)

    result = models.insert_model({"alias": "gateway-small"})

    assert result == created
    database.table.assert_called_once_with("models")
    query.insert.assert_called_once_with({"alias": "gateway-small"})
    query.insert.return_value.select.assert_called_once_with(models.MODEL_WRITE_COLUMNS)
