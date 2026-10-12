# Test for gateway.py / test for POST /chat/completions
# Supabase and the provider will be fake

from fastapi.testclient import TestClient
from unittest.mock import MagicMock

import httpx
from app.main import app
from app.routers import gateway

client=TestClient(app)
AUTH={"Authorization": "Bearer vktest"}
MODEL={"id":"m1","provider":"google", "model":"gemini-3.5-flash-lite"}
KEY={"user_id":"u1", "project_id":"p1","model_ids":["m1"]}
BODY={"model":"mq", "messages":[{"role": "user", "content": "hi"}]}
REPLY={"choices":[{"message":{"role":"assistant","content": "hello"}}]}

# Skipping Supabase, create fake_db
def fake_db(monkeypatch, key=KEY, model=MODEL):
    monkeypatch.setattr(gateway, "find_key", lambda raw:key)
    monkeypatch.setattr(gateway, "get_model_by_alias", lambda alias:model)

# Test missing virtual key 401
def test_missing_virtualkey():
    assert client.post("/chat/completions", json=BODY).status_code == 401

# Test invalid key 401
def test_invalid_key(monkeypatch):
    fake_db(monkeypatch, key=None)
    assert client.post("/chat/completions", json=BODY, headers=AUTH).status_code == 401

# Without test model 400
def test_model(monkeypatch):
    fake_db(monkeypatch)
    r=client.post("/chat/completions", json={"messages":[]},headers=AUTH)
    assert r.status_code == 400

# Unknown alias 404
def test_unknown_alias(monkeypatch):
    fake_db(monkeypatch, model=None)
    assert client.post("/chat/completions", json=BODY, headers=AUTH).status_code == 404

# Valid key, but project not allowed to use the model 403
def test_model_not_allowed_for_project(monkeypatch):
    fake_db(monkeypatch, key={**KEY, "model_ids":["others"]})
    assert client.post("/chat/completions", json=BODY, headers=AUTH).status_code == 403

# Unsupported provider 501
def test_unsupported_provider(monkeypatch):
    fake_db(monkeypatch, model={**MODEL, "provider":"nope"})
    assert client.post("/chat/completions", json=BODY, headers=AUTH).status_code == 501

# Real request

def test_real_request(monkeypatch):
    fake_db(monkeypatch)
    monkeypatch.setattr(gateway.config, "GEMINI_API_KEY", "provider-key")
    sent={}

    def fake_post(url, json, headers, timeout):
        sent.update(json=json, headers=headers)
        return httpx.Response(200, json=REPLY)

    monkeypatch.setattr(gateway.httpx, "post", fake_post)
    r=client.post("/chat/completions", json=BODY, headers=AUTH)

    assert r.status_code == 200 and r.json() ==REPLY
    assert sent["json"]["model"]=="gemini-3.5-flash-lite" #Check if alias is replaced
    assert sent["headers"]["Authorization"] == "Bearer provider-key" # Not the virtual key


# Test hash key
def test_hash_key():
    assert gateway.hash_key("abc")==(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )

# MacigMock emulates the supabase
def fake_supabase(rows):
    m=MagicMock()
    m.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows
    return m
# It returns exactly what we want to return independent to input
# Key valid
def test_find_valid_key(monkeypatch):
    rows=[{"user_id": "u1", "project_id": "p1", "expires_at": "2099-01-01T00:00:00+00:00", "projects": {"model_ids": ["m1"]}}]
    monkeypatch.setattr(gateway, "supabase", fake_supabase(rows))
    assert gateway.find_key("mq")=={"user_id": "u1", "project_id": "p1", "model_ids": ["m1"]}

# Key expired
def test_find_expired_key(monkeypatch):
    rows=[{"user_id": "u1", "project_id": "p1", "expires_at": "2020-01-01T00:00:00+00:00", "projects": {"model_ids": ["m1"]}}]
    monkeypatch.setattr(gateway, "supabase", fake_supabase(rows))
    assert gateway.find_key("mq") is None

# Unknown key
def test_find_unknown_key(monkeypatch):
    monkeypatch.setattr(gateway, "supabase", fake_supabase([]))
    assert gateway.find_key("mq") is None
