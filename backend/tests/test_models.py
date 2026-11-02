"""Focused tests for the models-list endpoint helpers and access rules."""

import os
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

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
    "prompt": "Keep answers concise.",
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
            "has_prompt": True,
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
            "has_prompt": True,
            "provider": "provider-internal",
            "model": "provider-small-2026",
            "data_processing_state": None,
            "prompt": "Keep answers concise.",
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
            "prompt": None,
        }
    )


def test_create_payload_accepts_and_normalizes_prompt():
    payload = model_payload(prompt="Be concise.\nUse bullet points.")
    assert models.build_model_data(payload)["prompt"] == (
        "Be concise.\nUse bullet points."
    )

    blank = model_payload(prompt="   ")
    assert models.build_model_data(blank)["prompt"] is None


def test_create_payload_rejects_oversized_prompt():
    with pytest.raises(ValidationError):
        model_payload(prompt="x" * (models.MAX_PROMPT_LENGTH + 1))


def test_blank_prompt_is_reported_as_absent():
    serialized = models.serialize_model({**MODEL_ROW, "prompt": "  "}, True)

    assert serialized["has_prompt"] is False
    assert serialized["prompt"] is None


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


def price_payload(**overrides):
    values = {
        "price_per_1m_input": "0.50",
        "price_per_1m_output": "2.00",
    }
    values.update(overrides)
    return models.ModelPriceUpdateRequest(**values)


def test_price_update_route_requires_bearer_authentication():
    response = TestClient(app).patch(
        f"/models/{MODEL_ROW['id']}/price",
        json={
            "price_per_1m_input": "0.50",
            "price_per_1m_output": "2.00",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_admin_can_update_model_prices(monkeypatch):
    updated = {
        **MODEL_ROW,
        "price_per_1m_input": "0.50",
        "price_per_1m_output": "2.00",
    }
    update = MagicMock(return_value=updated)
    monkeypatch.setattr(models, "update_model_price", update)

    result = models.patch_model_price(
        UUID(MODEL_ROW["id"]), price_payload(), ADMIN
    )

    assert result == updated
    update.assert_called_once_with(
        UUID(MODEL_ROW["id"]),
        {
            "price_per_1m_input": "0.50",
            "price_per_1m_output": "2.00",
        },
    )


def test_non_admin_cannot_update_model_prices(monkeypatch):
    update = MagicMock()
    monkeypatch.setattr(models, "update_model_price", update)

    with pytest.raises(HTTPException) as error:
        models.patch_model_price(UUID(MODEL_ROW["id"]), price_payload(), USER)

    assert error.value.status_code == 403
    assert error.value.detail == "Only administrators can update model prices"
    update.assert_not_called()


@pytest.mark.parametrize(
    "values",
    [
        {"price_per_1m_output": "2.00"},
        {"price_per_1m_input": "-0.01", "price_per_1m_output": "2.00"},
        {"price_per_1m_input": "0.50", "price_per_1m_output": "0.0000001"},
        {
            "price_per_1m_input": "0.50",
            "price_per_1m_output": "2.00",
            "unexpected": "field",
        },
    ],
)
def test_price_update_payload_rejects_invalid_values(values):
    with pytest.raises(ValidationError):
        models.ModelPriceUpdateRequest(**values)


def test_price_update_returns_not_found(monkeypatch):
    monkeypatch.setattr(models, "update_model_price", MagicMock(return_value=None))

    with pytest.raises(HTTPException) as error:
        models.patch_model_price(UUID(MODEL_ROW["id"]), price_payload(), ADMIN)

    assert error.value.status_code == 404
    assert error.value.detail == "Model not found"


def test_price_update_hides_database_error(monkeypatch):
    monkeypatch.setattr(
        models,
        "update_model_price",
        MagicMock(side_effect=RuntimeError("database password")),
    )

    with pytest.raises(HTTPException) as error:
        models.patch_model_price(UUID(MODEL_ROW["id"]), price_payload(), ADMIN)

    assert error.value.status_code == 500
    assert error.value.detail == "Failed to update model prices"


def test_update_model_price_returns_updated_row(monkeypatch):
    updated = {
        **MODEL_ROW,
        "price_per_1m_input": "0.50",
        "price_per_1m_output": "2.00",
    }
    query = MagicMock()
    query.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[updated]
    )
    database = MagicMock()
    database.table.return_value = query
    monkeypatch.setattr(models, "supabase", database)
    price_data = {
        "price_per_1m_input": "0.50",
        "price_per_1m_output": "2.00",
    }

    result = models.update_model_price(UUID(MODEL_ROW["id"]), price_data)

    assert result == updated
    database.table.assert_called_once_with("models")
    query.update.assert_called_once_with(price_data)
    query.update.return_value.eq.assert_called_once_with("id", MODEL_ROW["id"])


def prompt_payload(prompt="Be concise."):
    return models.ModelPromptUpdateRequest(prompt=prompt)


def test_prompt_update_route_requires_bearer_authentication():
    response = TestClient(app).patch(
        f"/models/{MODEL_ROW['id']}/prompt",
        json={"prompt": "Be concise."},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


def test_admin_can_update_model_prompt_and_audit(monkeypatch):
    updated = {**MODEL_ROW, "prompt": "Be accurate.\nBe concise."}
    update = MagicMock(return_value=updated)
    audit = MagicMock()
    monkeypatch.setattr(models, "update_model_prompt", update)
    monkeypatch.setattr(models, "record_model_audit", audit)

    result = models.patch_model_prompt(
        UUID(MODEL_ROW["id"]),
        prompt_payload("Be accurate.\nBe concise."),
        ADMIN,
    )

    assert result == updated
    update.assert_called_once_with(
        UUID(MODEL_ROW["id"]),
        "Be accurate.\nBe concise.",
    )
    audit.assert_called_once_with("model_modify", ADMIN.id, updated)


@pytest.mark.parametrize("prompt", [None, "", "   "])
def test_admin_can_remove_model_prompt(monkeypatch, prompt):
    updated = {**MODEL_ROW, "prompt": None}
    update = MagicMock(return_value=updated)
    monkeypatch.setattr(models, "update_model_prompt", update)
    monkeypatch.setattr(models, "record_model_audit", MagicMock())

    result = models.patch_model_prompt(
        UUID(MODEL_ROW["id"]), prompt_payload(prompt), ADMIN
    )

    assert result["prompt"] is None
    update.assert_called_once_with(UUID(MODEL_ROW["id"]), None)


def test_non_admin_cannot_update_model_prompt(monkeypatch):
    update = MagicMock()
    monkeypatch.setattr(models, "update_model_prompt", update)

    with pytest.raises(HTTPException) as error:
        models.patch_model_prompt(
            UUID(MODEL_ROW["id"]), prompt_payload(), USER
        )

    assert error.value.status_code == 403
    assert error.value.detail == "Only administrators can update model prompts"
    update.assert_not_called()


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"prompt": "x" * (models.MAX_PROMPT_LENGTH + 1)},
        {"prompt": "Be concise.", "promt": "typo"},
    ],
)
def test_prompt_update_payload_rejects_invalid_values(values):
    with pytest.raises(ValidationError):
        models.ModelPromptUpdateRequest(**values)


def test_prompt_update_returns_not_found_without_audit(monkeypatch):
    audit = MagicMock()
    monkeypatch.setattr(models, "update_model_prompt", MagicMock(return_value=None))
    monkeypatch.setattr(models, "record_model_audit", audit)

    with pytest.raises(HTTPException) as error:
        models.patch_model_prompt(
            UUID(MODEL_ROW["id"]), prompt_payload(), ADMIN
        )

    assert error.value.status_code == 404
    assert error.value.detail == "Model not found"
    audit.assert_not_called()


def test_prompt_update_hides_database_error(monkeypatch):
    monkeypatch.setattr(
        models,
        "update_model_prompt",
        MagicMock(side_effect=RuntimeError("database password")),
    )

    with pytest.raises(HTTPException) as error:
        models.patch_model_prompt(
            UUID(MODEL_ROW["id"]), prompt_payload(), ADMIN
        )

    assert error.value.status_code == 500
    assert error.value.detail == "Failed to update model prompt"


def test_prompt_update_succeeds_when_audit_fails(monkeypatch):
    updated = {**MODEL_ROW, "prompt": "Be concise."}
    monkeypatch.setattr(models, "update_model_prompt", lambda model_id, prompt: updated)
    monkeypatch.setattr(
        models,
        "record_model_audit",
        MagicMock(side_effect=RuntimeError("audit unavailable")),
    )

    result = models.patch_model_prompt(
        UUID(MODEL_ROW["id"]), prompt_payload(), ADMIN
    )

    assert result == updated


def test_update_model_prompt_returns_updated_row(monkeypatch):
    updated = {**MODEL_ROW, "prompt": "Be concise."}
    query = MagicMock()
    query.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[updated]
    )
    database = MagicMock()
    database.table.return_value = query
    monkeypatch.setattr(models, "supabase", database)

    result = models.update_model_prompt(
        UUID(MODEL_ROW["id"]), "Be concise."
    )

    assert result == updated
    database.table.assert_called_once_with("models")
    query.update.assert_called_once_with({"prompt": "Be concise."})
    query.update.return_value.eq.assert_called_once_with("id", MODEL_ROW["id"])


def test_record_model_audit_writes_documented_state(monkeypatch):
    query = MagicMock()
    database = MagicMock()
    database.table.return_value = query
    monkeypatch.setattr(models, "supabase", database)

    models.record_model_audit("model_modify", ADMIN.id, MODEL_ROW)

    database.table.assert_called_once_with("audits")
    query.insert.assert_called_once_with(
        {
            "action": "model_modify",
            "user_id": ADMIN.id,
            "target_id": MODEL_ROW["id"],
            "details": models.model_audit_details(MODEL_ROW),
        }
    )
    query.insert.return_value.execute.assert_called_once_with()
