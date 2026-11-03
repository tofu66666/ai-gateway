# Test for gateway.py / test for POST /chat/completions
# Supabase and the provider will be fake

from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials
from unittest.mock import MagicMock, call
import pytest
import httpx

from app.main import app
from app import budget, guardrails, request_log
from app.routers import gateway

client=TestClient(app)
AUTH={"Authorization": "Bearer vktest"}
MODEL={"id":"m1", "alias":"mq", "provider":"google", "model":"gemini-3.5-flash-lite"}
KEY={"user_id":"u1", "project_id":"p1","model_ids":["m1"],"key_model_ids":[]}
BODY={"model":"mq", "messages":[{"role": "user", "content": "hi"}]}
REPLY={"choices":[{"message":{"role":"assistant","content": "hello"}}]}
USAGE_REPLY={**REPLY,"usage":{"prompt_tokens":1000, "completion_tokens":500}}

# Skipping Supabase, create fake_db
# It takes what the gateway writes to the request table and project spend

NO_GUARDRAILS={"blocked_patterns": [], "max_tokens_cap": None}

def fake_auth(monkeypatch, key=KEY, model=MODEL, rules=NO_GUARDRAILS):
    # Skip the key check
    monkeypatch.setitem(
        app.dependency_overrides, gateway.require_budget_available, lambda: key
    )
    monkeypatch.setattr(guardrails, "get_project_guardrails", lambda project_id: rules)
    ids={str(i) for i in key["model_ids"]}
    allowed=[model] if model and str(model["id"]) in ids else []

    monkeypatch.setattr(gateway, "get_allowed_models", lambda model_ids: allowed)
    monkeypatch.setattr(gateway, "model_exists", lambda name: model is not None)

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

# Test expired key rejected: 401
def test_model(monkeypatch):
    def expired(response, credentials):
        response.status_code=401
        return {"message":"Virtual key expired"}
    monkeypatch.setattr(gateway, "validate_virtual_key", expired)    
    assert post().status_code == 401

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
    monkeypatch.setattr(gateway, "lookup_key_id", lambda raw: "k1")
    monkeypatch.setattr(gateway,"get_proj_m_ids", lambda project_id:["m1"])
    cred=HTTPAuthorizationCredentials(scheme="Bearer",credentials="vktest")
    assert gateway.get_key(cred)=={**KEY, "key_id":"k1"}

# get_key passes on the models the key is limited to
def test_get_key_includes_key_models(monkeypatch):
    monkeypatch.setattr(
        gateway, "validate_virtual_key",
        lambda response, credentials:{
            "user_id": "u1",
            "project_id": "p1",
            "key_id": "k1",
            "model_ids": ["m1"],
        },
    )
    monkeypatch.setattr(gateway,"get_proj_m_ids", lambda project_id:["m1","m2"])
    cred=HTTPAuthorizationCredentials(scheme="Bearer",credentials="vktest")
    key=gateway.get_key(cred)
    assert key["model_ids"]==["m1","m2"]
    assert key["key_model_ids"]==["m1"]


@pytest.mark.parametrize(
    "exhausted",
    [
        {"scope": "project", "id": "p1", "name": "Search"},
        {"scope": "team", "id": "t1", "name": "Platform"},
    ],
)
def test_exhausted_budget_rejected_before_provider(monkeypatch, exhausted):
    fake_auth(monkeypatch)
    app.dependency_overrides.pop(gateway.require_budget_available)
    monkeypatch.setitem(app.dependency_overrides, gateway.get_key, lambda: KEY)
    monkeypatch.setattr(budget, "get_exhausted_budget", lambda project_id: exhausted)
    provider = MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)
    logged = fake_log(monkeypatch)

    response = post()

    assert response.status_code == 429
    assert exhausted["scope"] in response.json()["detail"]
    assert exhausted["name"] in response.json()["detail"]
    provider.assert_not_called()
    assert logged == []


def test_budget_check_failure_stops_provider_call(monkeypatch):
    fake_auth(monkeypatch)
    app.dependency_overrides.pop(gateway.require_budget_available)
    monkeypatch.setitem(app.dependency_overrides, gateway.get_key, lambda: KEY)
    monkeypatch.setattr(
        budget,
        "get_exhausted_budget",
        MagicMock(side_effect=RuntimeError("database down")),
    )
    provider = MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)

    response = post()

    assert response.status_code == 503
    provider.assert_not_called()


def budget_table(row):
    table = MagicMock()
    query = table.select.return_value.eq.return_value.limit.return_value
    query.execute.return_value.data = [row]
    return table


def test_exhausted_project_budget_is_identified(monkeypatch):
    project_table = budget_table(
        {
            "id": "p1",
            "name": "Search",
            "team_id": "t1",
            "budget_per_month": "0.03",
            "spend_this_month": "0.03",
            "warning_threshold": "0.8",
        }
    )
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = project_table
    monkeypatch.setattr(budget, "supabase", fake_supabase)

    assert budget.get_exhausted_budget("p1") == {
        "scope": "project",
        "id": "p1",
        "name": "Search",
    }
    fake_supabase.table.assert_called_once_with("projects")


@pytest.mark.parametrize("team_budget,expected_scope", [("10", "team"), ("11", None)])
def test_team_budget_block_lifts_when_raised(monkeypatch, team_budget, expected_scope):
    project_table = budget_table(
        {
            "id": "p1",
            "name": "Search",
            "team_id": "t1",
            "budget_per_month": None,
            "spend_this_month": "0",
            "warning_threshold": "0.8",
        }
    )
    team_table = budget_table(
        {
            "id": "t1",
            "name": "Platform",
            "budget_per_month": team_budget,
            "warning_threshold": "0.8",
        }
    )
    fake_supabase = MagicMock()
    fake_supabase.table.side_effect = lambda name: {
        "projects": project_table,
        "teams": team_table,
    }[name]
    monkeypatch.setattr(budget, "supabase", fake_supabase)
    monkeypatch.setattr(budget, "get_team_spend", lambda team_id: 10)

    exhausted = budget.get_exhausted_budget("p1")

    assert (exhausted or {}).get("scope") == expected_scope


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

# Project allows the model, but the key is limited to other models: 403, no provider call
def test_model_not_allowed_for_key(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "model_ids":["m1","m2"], "key_model_ids":["m2"]})
    logged=fake_log(monkeypatch)
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)
    r=post()

    assert r.status_code == 403
    assert "not allowed for this key" in r.json()["detail"]
    provider.assert_not_called()
    assert logged==[]

# Model is on the key's list and the project's: goes through
def test_model_on_key_list(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "model_ids":["m1","m2"], "key_model_ids":["m1"]})
    fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, json=REPLY))
    assert post().status_code == 200

# Empty list on the key: every model of the project
def test_key_without_a_list_uses_all_project_models(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "key_model_ids":[]})
    fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, json=REPLY))
    assert post().status_code == 200

# Model is on the key's list but the project removed it: the project wins
def test_model_removed_from_project_stops_working_on_key(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "model_ids":["m2"], "key_model_ids":["m1"]})
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)
    r=post()

    assert r.status_code == 403
    assert "not allowed for this project" in r.json()["detail"]
    provider.assert_not_called()

# Every model on the key's list was removed: refused, not treated as "no list"
def test_key_whose_models_were_all_removed_stays_limited(monkeypatch):
    fake_auth(monkeypatch, key={**KEY, "model_ids":["m1"], "key_model_ids":["gone"]})
    r=post()

    assert r.status_code == 403
    assert "not allowed for this key" in r.json()["detail"]

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


def test_real_request_prepends_model_master_prompt(monkeypatch):
    fake_auth(monkeypatch, model={**MODEL, "prompt": "Be accurate and concise."})
    fake_log(monkeypatch)
    monkeypatch.setattr(gateway.config, "GEMINI_API_KEY", "provider-key")
    sent = {}

    def fake_post(url, json, headers, timeout):
        sent.update(json=json)
        return httpx.Response(200, json=REPLY)

    monkeypatch.setattr(gateway.httpx, "post", fake_post)

    response = post()

    assert response.status_code == 200
    assert sent["json"]["messages"] == [
        {"role": "system", "content": "Be accurate and concise."},
        {"role": "user", "content": "hi"},
    ]


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


# check response model is real model name and request_id header
def test_response_model_alias_request_id(monkeypatch):
    fake_auth(monkeypatch)
    monkeypatch.setattr(request_log, "log_request", lambda **args:"req1")
    fake_provider(monkeypatch, response=httpx.Response(200, json={**USAGE_REPLY, "model":"gemini-3.5-flash-lite"}))

    r=post()

    assert r.status_code==200
    assert r.json()["model"]=="gemini-3.5-flash-lite"
    assert r.headers["X-Request-ID"]=="req1"

# check there is no request id header when logging fails

def test_response_model_no_req_id_logging_failure(monkeypatch):
    fake_auth(monkeypatch)
    monkeypatch.setattr(request_log, "log_request", lambda **args: None)
    fake_provider(monkeypatch, response=httpx.Response(200, json={**USAGE_REPLY}))

    r=post()

    assert r.status_code==200
    assert "X-Request-ID" not in r.headers
    assert "model" not in r.json() #no model key in the reply -> nothing added

# error response with request id without model
def test_logs_error_res_with_req_id_no_model(monkeypatch):
    fake_auth(monkeypatch)
    monkeypatch.setattr(request_log, "log_request", lambda **args: "req2")
    fake_provider(monkeypatch, response=httpx.Response(429, json={"error":{"message":"quota"}}))

    r=post()

    assert r.status_code==429
    assert r.headers["X-Request-ID"]=="req2"
    assert "model" not in r.json() 

@pytest.fixture
def log_setup(monkeypatch):
    monkeypatch.setitem(app.dependency_overrides, gateway.require_budget_available, lambda: KEY)
    monkeypatch.setattr(gateway, "get_allowed_models", lambda ids: [MODEL])
    monkeypatch.setattr(gateway, "model_exists", lambda name: True)
    monkeypatch.setattr(guardrails, "get_project_guardrails", lambda project_id: NO_GUARDRAILS)
    logged=[]
    monkeypatch.setattr(request_log, "log_request", lambda **a: logged.append(a))
    return logged

# Non-streaming: {"choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}],
#                 "usage":{"prompt_tokens":10,"completion_tokens":5}}
# Non-streaming -> message
# Streaming chunk {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}
# Streaming-> delta

# test request logs: request and response texts
def test_json_req_log_req_res_text(log_setup, monkeypatch):
    logged=log_setup
    reply={"choices":[{"message":{"role":"assistant", "content": "hello"}}]}
    monkeypatch.setattr(gateway, "call_prov", lambda p, e, b: httpx.Response(200, json=reply))
    r=client.post("/chat/completions", headers=AUTH, json={
        "model":"mq",
        "messages":[{"role":"user","content":"q1"},
                    {"role":"assistant","content":"a1"},
                    {"role":"user","content":"q2"}],
    })
    assert r.status_code==200
    assert logged[0]["request_text"]=="q2" # Pick the newest message
    assert logged[0]["response_text"]=="hello"

def test_json_error_no_response(log_setup, monkeypatch):
    logged=log_setup
    monkeypatch.setattr(gateway, "call_prov", lambda p, e, b: httpx.Response(500, json={"error": {"message": "x"}}))
    client.post("/chat/completions", headers=AUTH, json={
        "model":"mq",
        "messages":[{"role":"user","content":"q1"}],
    })
    assert logged[0]["request_text"]=="q1"
    assert logged[0]["response_text"] is None

# Master prompt not in request_text saved

def test_master_prompt_not_saved_as_request_text(log_setup, monkeypatch):
    logged=log_setup
    monkeypatch.setitem(MODEL, "prompt", "Be brief")
    sent={}
    def fake_call(p,e,b):
        sent["body"]=b
        return httpx.Response(200, json={"choices":[{"message":{"content":"ok"}}]})
    
    monkeypatch.setattr(gateway, "call_prov", fake_call)
    client.post("/chat/completions", headers=AUTH, json={
                "model":"mq",
                "messages":[{"role":"user","content":"q1"}],
    })
    assert sent["body"]["messages"][0] == {"role":"system","content":"Be brief"} # maste prompt sent to the provider
    assert logged[0]["request_text"]=="q1" # but not saved
    








