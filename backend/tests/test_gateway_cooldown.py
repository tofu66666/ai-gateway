# Cooldown and busy counts on POST /chat/completions (H18IALMOND-37)
# Supabase and the provider are fake, as in test_gateway.py

from unittest.mock import MagicMock

import httpx
import pytest

from app import load_balancer, request_log
from app.routers import gateway
from tests.test_gateway import USAGE_REPLY, fake_auth, fake_log, fake_provider, post
from tests.test_gateway_routing import EAST, ERROR, TWO, record_calls


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_provider_errors_count_towards_cooldown(monkeypatch, status):
    fake_auth(monkeypatch, deployments=[EAST])
    fake_log(monkeypatch)
    record_calls(monkeypatch, httpx.Response(status, json=ERROR))

    for _ in range(3):
        post()

    assert load_balancer.balancer.cooldown_left("d-east") > 0


@pytest.mark.parametrize("error", [httpx.ReadTimeout("slow"), httpx.ConnectError("down")])
def test_timeouts_and_outages_count_towards_cooldown(monkeypatch, error):
    fake_auth(monkeypatch, deployments=[{**EAST, "provider": "google"}])
    fake_log(monkeypatch)
    fake_provider(monkeypatch, error=error)

    for _ in range(3):
        post()

    assert load_balancer.balancer.cooldown_left("d-east") > 0


def test_rejected_deployment_key_counts_towards_cooldown(monkeypatch):
    fake_auth(monkeypatch, deployments=[EAST])
    fake_log(monkeypatch)
    record_calls(monkeypatch, httpx.Response(401, json=ERROR))

    for _ in range(3):
        assert post().status_code == 502

    assert load_balancer.balancer.cooldown_left("d-east") > 0


@pytest.mark.parametrize("status", [400, 404, 422])
def test_client_errors_do_not_count_towards_cooldown(monkeypatch, status):
    fake_auth(monkeypatch, deployments=[EAST])
    fake_log(monkeypatch)
    record_calls(monkeypatch, httpx.Response(status, json=ERROR))

    for _ in range(5):
        post()

    assert load_balancer.balancer.cooldown_left("d-east") == 0


def test_failing_deployment_leaves_rotation(monkeypatch):
    fake_auth(monkeypatch, deployments=TWO)
    fake_log(monkeypatch)
    calls = record_calls(monkeypatch)
    for _ in range(3):
        load_balancer.balancer.record_failure("d-east")

    for _ in range(4):
        assert post().status_code == 200

    assert {c["model"] for c in calls} == {"gpt-west"}


def test_all_in_cooldown_returns_503_without_provider_call(monkeypatch):
    fake_auth(monkeypatch, deployments=TWO)
    logged = fake_log(monkeypatch)
    calls = record_calls(monkeypatch)
    for deployment in TWO:
        for _ in range(3):
            load_balancer.balancer.record_failure(deployment["id"])

    r = post()

    assert r.status_code == 503
    assert "mq" in r.json()["detail"]
    assert r.headers["Retry-After"] == "60"
    assert calls == []
    assert [row["status_code"] for row in logged] == [503]


def test_alias_without_deployments_returns_503(monkeypatch):
    fake_auth(monkeypatch, deployments=[])
    fake_log(monkeypatch)
    calls = record_calls(monkeypatch)

    r = post()

    assert r.status_code == 503
    assert "Retry-After" not in r.headers
    assert calls == []


def test_refused_request_returns_request_id(monkeypatch):
    fake_auth(monkeypatch, deployments=[])
    monkeypatch.setattr(request_log, "log_request", lambda **args: "req7")

    assert post().headers["X-Request-ID"] == "req7"


def test_deployment_lookup_failure_stops_provider_call(monkeypatch):
    fake_auth(monkeypatch)
    monkeypatch.setattr(
        gateway, "get_deployments", MagicMock(side_effect=RuntimeError("database down"))
    )
    calls = record_calls(monkeypatch)

    assert post().status_code == 503
    assert calls == []


# Busy counts


def test_finished_request_is_no_longer_busy(monkeypatch):
    fake_auth(monkeypatch, deployments=[EAST])
    fake_log(monkeypatch)
    record_calls(monkeypatch)

    post()

    assert load_balancer.balancer.in_flight("d-east") == 0


def test_request_is_busy_while_the_provider_works(monkeypatch):
    fake_auth(monkeypatch, deployments=[EAST])
    fake_log(monkeypatch)
    during = []

    def fake_post(url, json, headers, timeout):
        during.append(load_balancer.balancer.in_flight("d-east"))
        return httpx.Response(200, json=USAGE_REPLY)

    monkeypatch.setattr(gateway.httpx, "post", fake_post)

    post()

    assert during == [1]


def test_unsupported_provider_is_not_left_busy(monkeypatch):
    fake_auth(monkeypatch, deployments=[{**EAST, "provider": "nope"}])
    fake_log(monkeypatch)

    assert post().status_code == 501
    assert load_balancer.balancer.in_flight("d-east") == 0
