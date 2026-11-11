from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import CurrentUser, get_current_user
from app.main import app
from app.retry_policy import DEFAULT_POLICY, POLICY_COLUMNS
from app.routers import models

MODEL_ID = "44444444-4444-4444-4444-444444444444"
URL = f"/models/{MODEL_ID}/resilience"
client = TestClient(app)


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setitem(app.dependency_overrides, get_current_user,
                        lambda: CurrentUser("admin", None, "admin"))
    fake = MagicMock()
    query = fake.table.return_value
    query.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [DEFAULT_POLICY]
    query.update.return_value.eq.return_value.execute.return_value.data = [DEFAULT_POLICY]
    monkeypatch.setattr(models, "supabase", fake)
    return query


def test_read_and_save_policy(db):
    assert client.get(URL).json() == DEFAULT_POLICY
    db.select.assert_called_once_with(POLICY_COLUMNS)
    assert client.put(URL, json=DEFAULT_POLICY).json() == DEFAULT_POLICY
    db.update.assert_called_once_with(DEFAULT_POLICY)


@pytest.mark.parametrize("method", ["get", "put"])
def test_admin_only(db, monkeypatch, method):
    monkeypatch.setitem(app.dependency_overrides, get_current_user,
                        lambda: CurrentUser("user", None, "user"))
    assert client.request(method, URL, json=DEFAULT_POLICY).status_code == 403
    db.select.assert_not_called()
    db.update.assert_not_called()


@pytest.mark.parametrize("change", [
    {"retry_count": -1}, {"retry_backoff_seconds": [1]},
    {"retry_backoff_seconds": [-1, 2, 4]}, {"timeout_seconds": 0},
])
def test_invalid_settings(db, change):
    assert client.put(URL, json={**DEFAULT_POLICY, **change}).status_code == 422
    db.update.assert_not_called()


def test_missing_model(db):
    db.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    db.update.return_value.eq.return_value.execute.return_value.data = []
    assert client.get(URL).status_code == 404
    assert client.put(URL, json=DEFAULT_POLICY).status_code == 404


def test_disabled_retries_and_custom_timeout(db):
    policy = {"retry_count": 0, "retry_backoff_seconds": [], "timeout_seconds": 90}
    db.update.return_value.eq.return_value.execute.return_value.data = [policy]
    assert client.put(URL, json=policy).json() == policy
