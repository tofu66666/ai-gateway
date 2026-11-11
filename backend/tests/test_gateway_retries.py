from unittest.mock import MagicMock

import httpx
import pytest

from app import load_balancer, retry_policy
from app.routers import gateway
from tests.test_gateway import MODEL, USAGE_REPLY, fake_auth, fake_log, post


def test_retry_success_logs_once_and_keeps_deployment(monkeypatch):
    fake_auth(monkeypatch)
    logged = fake_log(monkeypatch)
    waits = []
    monkeypatch.setattr(retry_policy, "sleep", waits.append)
    send = MagicMock(side_effect=[
        httpx.Response(503), httpx.Response(503), httpx.Response(200, json=USAGE_REPLY),
    ])
    monkeypatch.setattr(gateway.httpx, "post", send)
    assert post().status_code == 200
    assert len(logged) == 1
    assert logged[0]["attempt_count"] == 3
    assert logged[0]["payload"] == USAGE_REPLY
    assert logged[0]["deployment_id"] == "d1"
    assert waits == [1, 2]
    assert {call.kwargs["timeout"] for call in send.call_args_list} == {30}
    assert load_balancer.balancer.cooldown_left("d1") == 0
    assert load_balancer.balancer.in_flight("d1") == 0


def test_three_final_failures_trigger_cooldown_not_three_attempts(monkeypatch):
    fake_auth(monkeypatch)
    logged = fake_log(monkeypatch)
    send = MagicMock(return_value=httpx.Response(503, json={"error": "down"}))
    monkeypatch.setattr(gateway.httpx, "post", send)
    for count in range(3):
        assert post().status_code == 503
        assert send.call_count == (count + 1) * 4
        if count < 2:
            assert load_balancer.balancer.cooldown_left("d1") == 0
    assert load_balancer.balancer.cooldown_left("d1") > 0
    assert post().status_code == 503
    assert send.call_count == 12
    assert [row["attempt_count"] for row in logged] == [4, 4, 4, 0]


@pytest.mark.parametrize("status", [400, 401, 403])
def test_permanent_error_is_not_retried(monkeypatch, status):
    fake_auth(monkeypatch)
    logged = fake_log(monkeypatch)
    send = MagicMock(return_value=httpx.Response(status, json={"error": "rejected"}))
    monkeypatch.setattr(gateway.httpx, "post", send)
    assert post().status_code == (502 if status in (401, 403) else status)
    send.assert_called_once()
    assert logged[0]["attempt_count"] == 1


@pytest.mark.parametrize("retries,timeout", [(0, 90), (1, 12)])
def test_alias_policy_reaches_provider(monkeypatch, retries, timeout):
    fake_auth(monkeypatch, model={
        **MODEL, "retry_count": retries,
        "retry_backoff_seconds": [0.5] * retries, "timeout_seconds": timeout,
    })
    logged = fake_log(monkeypatch)
    waits = []
    monkeypatch.setattr(retry_policy, "sleep", waits.append)
    send = MagicMock(side_effect=httpx.ReadTimeout("slow"))
    monkeypatch.setattr(gateway.httpx, "post", send)
    assert post().status_code == 504
    assert send.call_count == retries + 1
    assert logged[0]["attempt_count"] == retries + 1
    assert send.call_args.kwargs["timeout"] == timeout
    assert waits == [0.5] * retries
