# Test H18IALMOND-18
import pytest
import httpx

from app.routers import gateway
from tests.test_gateway import MODEL, USAGE_REPLY, fake_auth, fake_log, post
from tests.test_gateway_routing import TWO

ORDERED_MODEL = {**MODEL, "routing_strategy": "ordered"}


def providers(monkeypatch, east, west):
    # east and west are the outcome of each deployment: a Response or an Exception
    calls=[]

    def fake_post(url, json, headers, timeout):
        calls.append(json["model"])
        outcome=east if "east" in url else west
        if isinstance(outcome, httpx.HTTPError):
            raise outcome
        return outcome

    monkeypatch.setattr(gateway.httpx, "post", fake_post)
    return calls


@pytest.mark.parametrize("failure",[
    httpx.Response(500, json={"error": {"message": "down"} }),
    httpx.Response(429, json={"error": {"message": "rate limited"}}),
    httpx.ReadTimeout("slow"),
], ids=["500", "429", "timeout"])
def test_failed_primary_falls_over_to_next_deployment(monkeypatch, failure):
    fake_auth(monkeypatch, model=ORDERED_MODEL, deployments=TWO)
    fake_log(monkeypatch)
    calls = providers(monkeypatch, failure, httpx.Response(200, json=USAGE_REPLY))


    r=post()

    assert r.status_code == 200
    assert calls == ["gpt-east", "gpt-west"]


def test_client_error_is_not_sent_to_the_next_deployment(monkeypatch):
    fake_auth(monkeypatch, model=ORDERED_MODEL, deployments=TWO)
    fake_log(monkeypatch)
    calls=providers(
        monkeypatch,
        httpx.Response(400, json={"error": {"message": "bad request"}}),
        httpx.Response(200, json=USAGE_REPLY),
    )

    r=post()

    assert r.status_code == 400
    assert calls == ["gpt-east"]


def test_failed_and_successful_deployments_are_both_logged(monkeypatch):
    fake_auth(monkeypatch, model=ORDERED_MODEL, deployments=TWO)
    logged=fake_log(monkeypatch)
    providers(
        monkeypatch,
        httpx.Response(500, json={"error": {"message": "down"}}),
        httpx.Response(200, json=USAGE_REPLY),
    )


    post()


    assert [(e["deployment_id"], e["status_code"]) for e in logged] == [
        ("d-east", 500),
        ("d-west", 200),
    ]


def test_all_failing_returns_one_error_naming_alias_and_attempts(monkeypatch):
    fake_auth(monkeypatch, model=ORDERED_MODEL, deployments=TWO)
    fake_log(monkeypatch)
    providers(
        monkeypatch,
        httpx.Response(500, json={"error": {"message": "down"}}),
        httpx.Response(500, json={"error": {"message": "down"}}),
    )

    r=post()

    assert r.status_code==502
    message=r.json()["error"]["message"]
    assert "mq" in message
    assert "2 deployments" in message
    # east(fallback->without_retry 1 attempt) + west(normal policy=first attempt+ 3 retries=4 attempts)
    assert "5 attempts" in message


def test_only_the_last_deployment_is_retried(monkeypatch):
    fake_auth(monkeypatch, model=ORDERED_MODEL, deployments=TWO)
    fake_log(monkeypatch)
    calls=providers(
        monkeypatch,
        httpx.Response(500, json={"error": {"message": "down"}}),
        httpx.Response(500, json={"error": {"message": "down"}}),
    )


    post()


    assert calls==["gpt-east"]+["gpt-west"]*4
