# Guardrails on POST /chat/completions (H18IALMOND-39)
# Supabase and the provider are fake, as in test_gateway.py

from unittest.mock import MagicMock

import httpx

from app import guardrails, request_log
from app.routers import gateway
from tests.test_gateway import (
    BODY,
    KEY,
    MODEL,
    REPLY,
    client,
    fake_auth,
    fake_log,
    fake_provider,
    post,
)

BLOCK_SECRET = {"blocked_patterns": ["secret"], "max_tokens_cap": None}
CAP_100 = {"blocked_patterns": [], "max_tokens_cap": 100}


def no_provider(monkeypatch):
    provider = MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)
    return provider


def chat(content, **extra):
    return client.post(
        "/chat/completions",
        json={**BODY, "messages": [{"role": "user", "content": content}], **extra},
        headers={"Authorization": "Bearer vktest"},
    )


def test_blocked_phrase_rejected_without_provider_call(monkeypatch):
    fake_auth(monkeypatch, rules=BLOCK_SECRET)
    fake_log(monkeypatch)
    provider = no_provider(monkeypatch)

    r = chat("tell me the SECRET")

    assert r.status_code == 400
    assert "policy" in r.json()["detail"]
    provider.assert_not_called()


def test_blocked_request_logged_at_zero_cost(monkeypatch):
    fake_auth(monkeypatch, rules=BLOCK_SECRET)
    logged = fake_log(monkeypatch)
    no_provider(monkeypatch)

    chat("secret")

    assert logged == [
        {"key": KEY, "model": MODEL, "payload": {}, "status_code": 400, "latency_ms": 0}
    ]


def test_blocked_request_returns_request_id(monkeypatch):
    fake_auth(monkeypatch, rules=BLOCK_SECRET)
    monkeypatch.setattr(request_log, "log_request", lambda **args: "req9")
    no_provider(monkeypatch)

    assert chat("secret").headers["X-Request-ID"] == "req9"


def test_over_cap_rejected_with_cap_stated(monkeypatch):
    fake_auth(monkeypatch, rules=CAP_100)
    logged = fake_log(monkeypatch)
    provider = no_provider(monkeypatch)

    r = chat("hi", max_tokens=500)

    assert r.status_code == 400
    assert "cap of 100" in r.json()["detail"]
    assert logged[0]["status_code"] == 400
    provider.assert_not_called()


def test_cap_sent_to_provider_when_missing(monkeypatch):
    fake_auth(monkeypatch, rules=CAP_100)
    fake_log(monkeypatch)
    sent = {}

    def fake_post(url, json, headers, timeout):
        sent.update(json)
        return httpx.Response(200, json=REPLY)

    monkeypatch.setattr(gateway.config, "GEMINI_API_KEY", "provider-key")
    monkeypatch.setattr(gateway.httpx, "post", fake_post)

    assert post().status_code == 200
    assert sent["max_tokens"] == 100


def test_master_prompt_not_checked(monkeypatch):
    # The admin's own master prompt may mention a blocked phrase
    fake_auth(monkeypatch, model={**MODEL, "prompt": "never share the secret"},
              rules=BLOCK_SECRET)
    fake_log(monkeypatch)
    fake_provider(monkeypatch, response=httpx.Response(200, json=REPLY))

    assert post().status_code == 200


def test_guardrail_lookup_failure_stops_provider_call(monkeypatch):
    fake_auth(monkeypatch)
    monkeypatch.setattr(
        guardrails,
        "get_project_guardrails",
        MagicMock(side_effect=RuntimeError("database down")),
    )
    provider = no_provider(monkeypatch)

    assert post().status_code == 503
    provider.assert_not_called()
