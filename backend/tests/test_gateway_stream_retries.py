from unittest.mock import MagicMock

import httpx
import pytest

from app import load_balancer, retry_policy
from app.routers import gateway
from tests.test_gateway_stream import (
    GOOD, MODEL, FakeStream, chunk, do_post, stream_setup,
)


def test_stream_retries_before_start_and_logs_once(stream_setup, monkeypatch):
    logged, _, _ = stream_setup
    model = {**MODEL, "retry_count": 1, "retry_backoff_seconds": [0.25], "timeout_seconds": 7}
    monkeypatch.setattr(gateway, "get_allowed_models", lambda ids: [model])
    waits = []
    monkeypatch.setattr(retry_policy, "sleep", waits.append)
    failed, success = FakeStream([], status=503), FakeStream(GOOD)
    calls = []
    def open_next(deployment, endpoint, body, timeout=None):
        calls.append(timeout)
        if len(calls) == 1:
            return failed
        assert failed.closed
        return success
    monkeypatch.setattr(gateway, "open_stream", open_next)
    response = do_post()
    assert response.status_code == 200
    assert "Hel" in response.text and "lo" in response.text
    assert calls == [7, 7] and waits == [0.25]
    assert success.closed and len(logged) == 1
    assert logged[0]["attempt_count"] == 2
    assert response.headers["X-Request-ID"] == logged[0]["request_id"]
    assert load_balancer.balancer.in_flight("d1") == 0
    assert load_balancer.balancer.cooldown_left("d1") == 0


def test_stream_connection_failure_then_success(stream_setup, monkeypatch):
    logged, _, _ = stream_setup
    send = MagicMock(side_effect=[httpx.ConnectError("down"), FakeStream(GOOD)])
    monkeypatch.setattr(gateway, "open_stream", send)
    assert do_post().status_code == 200
    assert send.call_count == 2 and len(logged) == 1
    assert logged[0]["attempt_count"] == 2


@pytest.mark.parametrize("error,status", [
    (httpx.ReadTimeout("slow"), 504), (httpx.ConnectError("down"), 502),
])
def test_stream_exhausted_connection_attempts(stream_setup, monkeypatch, error, status):
    logged, _, _ = stream_setup
    send = MagicMock(side_effect=error)
    monkeypatch.setattr(gateway, "open_stream", send)
    assert do_post().status_code == status
    assert send.call_count == 4 and len(logged) == 1
    assert logged[0]["attempt_count"] == 4
    assert load_balancer.balancer.in_flight("d1") == 0


def test_started_stream_is_not_replayed(stream_setup, monkeypatch):
    logged, _, _ = stream_setup
    stream = FakeStream([chunk("partial"), ""], fail=httpx.ReadTimeout("slow"))
    send = MagicMock(return_value=stream)
    monkeypatch.setattr(gateway, "open_stream", send)
    response = do_post()
    assert "partial" in response.text and "provider_error" in response.text
    send.assert_called_once()
    assert stream.closed and len(logged) == 1
    assert logged[0]["attempt_count"] == 1 and logged[0]["status_code"] == 504
