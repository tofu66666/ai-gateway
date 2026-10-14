from unittest.mock import MagicMock, call

from fastapi.testclient import TestClient

from app.dependencies import CurrentUser, get_current_user
from app.main import app
from app.routers import request_history

client=TestClient(app)
USER=CurrentUser(id="u1", email="a@b.com", role="user")
ROW={
    "id":"r1",
    "project_id":"p1",
    "model_id":"m1",
    "user_id": "u1",
    "input_tokens":2,
    "output_tokens":10,
    "cost": 0.000004,
    "status":"200",
    "latency":1234,
    "created_at":"2026-10-13T06:53:30+00:00",
}

def fake_supabase(rows):
    fake=MagicMock()
    (fake.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data)=rows
    return fake

def as_user(monkeypatch, user=USER):
    monkeypatch.setitem(app.dependency_overrides, get_current_user, lambda: user)

# without login
def test_requests_login():
    assert client.get("/requests").status_code==401

# expected value?
def test_request_hist_returns_newest_first(monkeypatch):
    as_user(monkeypatch)
    fake=fake_supabase([ROW])
    monkeypatch.setattr(request_history, "supabase",fake)

    r=client.get("/requests")

    assert r.status_code==200
    assert r.json()==[ROW]
    chain=fake.table.return_value.select.return_value
    assert fake.table.call_args==call("requests")
    assert chain.eq.call_args==call("user_id", "u1")
    assert chain.eq.return_value.order.call_args==call("created_at",desc=True)

# empty case
def test_request_hist_empty(monkeypatch):
    as_user(monkeypatch)
    monkeypatch.setattr(request_history, "supabase", fake_supabase([]))

    r=client.get("/requests")

    assert r.status_code==200 and r.json()==[]
