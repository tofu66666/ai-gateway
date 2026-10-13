# Test for gateway.py / test for POST /chat/completions
# Supabase and the provider will be fake

from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials
from unittest.mock import MagicMock
import pytest
import httpx

from app.main import app
from app import request_log
from app.routers import gateway

client=TestClient(app)
AUTH={"Authorization": "Bearer vktest"}
MODEL={"id":"m1","provider":"google", "model":"gemini-3.5-flash-lite"}
KEY={"user_id":"u1", "project_id":"p1","model_ids":["m1"]}
BODY={"model":"mq", "messages":[{"role": "user", "content": "hi"}]}
REPLY={"choices":[{"message":{"role":"assistant","content": "hello"}}]}
USAGE_REPLY={**REPLY,"usage":{"prompt_tokens":1000, "completion_tokens":500}}

# Skipping Supabase, create fake_db
# It takes what the gateway writes to the request table and project spend

def fake_auth(monkeypatch, key=KEY, model=MODEL):
    # Skip the key check 
    monkeypatch.setitem(app.dependency_overrides, gateway.get_key, lambda: key)
    monkeypatch.setattr(gateway, "get_model_by_alias", lambda alias: model)

def fake_log(monkeypatch):
    # Substitui log_request
    logged=[]
    monkeypatch.setattr(request_log, "log_request", lambda **args: logged.append(args))
    return logged

def fake_provider(monkeypatch, response=None, error=None):
    monkeypatch.setattr(gateway.config, "GEMINI_API_KEY", "provider-key")
    
    def fake_post(url, json, headers, timeout):
        if error is not None:
            raise error
        return response
    monkeypatch.setattr(gateway.httpx, "post", fake_post)

def post():
    return client.post("/chat/completions", json=BODY, headers=AUTH)

# fake the validate_virtual_key

# Test missing virtual key 401
def test_missing_virtualkey():
    assert client.post("/chat/completions", json=BODY).status_code == 401

# Test invalid key rejected: 401
def test_invalid_key(monkeypatch):
    def reject(response, credentials):
        response.status_code=401
        return {"message":"Unauthorised"}

    monkeypatch.setattr(gateway, "validate_virtual_key", reject)
    assert post().status_code == 401

# Test expired key rejected: 403
def test_model(monkeypatch):
    def expired(response, credentials):
        response.status_code=403
        return {"message":"Virtual key expired"}
    monkeypatch.setattr(gateway, "validate_virtual_key", expired)    
    assert post().status_code == 403

# Test get_key 
def test_get_key(monkeypatch):
    monkeypatch.setattr(
        gateway, "validate_virtual_key",
        lambda response, credentials:{
            "user_id": "u1",
            "project_id": "p1",
            "team_id": "t1",
            "expires_at": "2099-01-01",
        },
    )
    monkeypatch.setattr(gateway,"get_proj_m_ids", lambda project_id:["m1"])
    cred=HTTPAuthorizationCredentials(scheme="Bearer",credentials="vktest")
    assert gateway.get_key(cred)==KEY


# Request validation

def test_model_required(monkeypatch):
    fake_auth(monkeypatch)
    r=client.post("/chat/completions", json={"messages":[]}, headers=AUTH)
    assert r.status_code==400

# Unknown alias 404
def test_unknown_alias(monkeypatch):
    fake_auth(monkeypatch, model=None)
    assert post().status_code == 404

# Valid key, but project not allowed to use the model 403
def test_model_not_allowed_for_project(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "model_ids":["others"]})
    assert post().status_code == 403

# Unsupported provider 501
def test_unsupported_provider(monkeypatch):
    fake_auth(monkeypatch, model={**MODEL, "provider":"nope"})
    assert post().status_code == 501

# Real request

def test_real_request(monkeypatch):
    fake_auth(monkeypatch)
    fake_log(monkeypatch)
    monkeypatch.setattr(gateway.config, "GEMINI_API_KEY", "provider-key")
    sent={}

    def fake_post(url, json, headers, timeout):
        sent.update(json=json, headers=headers)
        return httpx.Response(200, json=REPLY)

    monkeypatch.setattr(gateway.httpx, "post", fake_post)
    r=post()

    assert r.status_code == 200 and r.json() ==REPLY
    assert sent["json"]["model"]=="gemini-3.5-flash-lite" #Check if alias is replaced
    assert sent["headers"]["Authorization"] == "Bearer provider-key" # Not the virtual key

# Test logging

# Valid call: result one row and update the project spend
def test_logs_request_success(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, json=USAGE_REPLY))
    r=post()

    assert r.status_code==200 and r.json()==USAGE_REPLY
    assert len(logged)==1
    sent=logged[0]
    assert sent["key"]==KEY
    assert sent["model"]==MODEL
    assert sent["payload"]==USAGE_REPLY
    assert sent["status_code"]==200
    assert isinstance(sent["latency_ms"], int) and sent["latency_ms"]>=0

# Provider errors: logged with status and no cost
def test_logs_provider_error(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(429, json={"error":{"message":"quota"}}))
    r=post()

    assert r.status_code==429
    assert logged[0]["status_code"]==429 

# Provider timeout
def test_logs_provider_timeout(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, error=httpx.ReadTimeout("slow"))
    r=post()
    
    assert r.status_code==504
    assert logged[0]["status_code"]==504

# Provider unreachable
def test_logs_provider_unreachable(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, error=httpx.ConnectError("down"))
    r=post()

    assert r.status_code==502
    assert logged[0]["status_code"]==502

# Provider response with wrong format (not JSON)
def test_logs_provider_non_json(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, text="<html>not Json</html>"))
    r=post()
    
    assert r.status_code==502
    assert logged[0]["status_code"]==502

# Non json and down
def test_logs_error_non_json(monkeypatch):
    fake_auth(monkeypatch)
    logged=fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(503, text="<html>down</html>"))
    r=post()

    assert r.status_code==503
    assert logged[0]["status_code"]==503

# Rejected calls : Not logged
def test_logs_rejected_calls(monkeypatch):
    fake_auth(monkeypatch, key={**KEY,"model_ids":["others"]})
    logged=fake_log(monkeypatch)
    r=post()

    assert r.status_code==403
    assert logged==[]

# Logging failure: User gest still the reply
def test_logs_logging_failure(monkeypatch):
    fake_auth(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, json=USAGE_REPLY))
    fail=MagicMock()
    fail.table.side_effect=RuntimeError("database down") 
    monkeypatch.setattr(request_log, "supabase", fail)
    r=post()
    
    assert r.status_code==200 and r.json()==USAGE_REPLY

# Test get project model ids

def fake_supabase(rows):
    m=MagicMock()
    m.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data=rows
    return m

def test_get_proj_m_ids(monkeypatch):
    monkeypatch.setattr(gateway, "supabase", fake_supabase([{"model_ids":["m1"]}]))
    assert gateway.get_proj_m_ids("p1")==["m1"]

# project missing
def test_get_proj_m_ids_missing_project(monkeypatch):
    monkeypatch.setattr(gateway, "supabase", fake_supabase([]))
    assert gateway.get_proj_m_ids("p1")==[]

# model_ids with null
def test_get_proj_m_ids_null_column(monkeypatch):
    monkeypatch.setattr(gateway, "supabase", fake_supabase([{"model_ids":None}]))
    assert gateway.get_proj_m_ids("p1")==[]
