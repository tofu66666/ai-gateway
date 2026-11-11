from unittest.mock import MagicMock

import httpx
import pytest

from app import retry_policy
from app.retry_policy import DEFAULT_POLICY, call_with_retries


@pytest.fixture
def waits(monkeypatch):
    values = []
    monkeypatch.setattr(retry_policy, "sleep", values.append)
    return values


def test_transient_errors_then_success(waits):
    failures = [httpx.Response(503), httpx.Response(429)]
    success = httpx.Response(200)
    send = MagicMock(side_effect=[*failures, success])
    assert call_with_retries(send, DEFAULT_POLICY) == (success, None, 3)
    assert waits == [1, 2]
    assert all(response.is_closed for response in failures)


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
def test_stops_after_four_attempts(waits, status):
    response = httpx.Response(status)
    send = MagicMock(return_value=response)
    assert call_with_retries(send, DEFAULT_POLICY) == (response, None, 4)
    assert send.call_count == 4
    assert waits == [1, 2, 4]


@pytest.mark.parametrize("status", [200, 400, 401, 403, 404, 422])
def test_other_statuses_return_immediately(waits, status):
    response = httpx.Response(status)
    send = MagicMock(return_value=response)
    assert call_with_retries(send, DEFAULT_POLICY) == (response, None, 1)
    send.assert_called_once()
    assert waits == []


@pytest.mark.parametrize("error", [
    httpx.ReadTimeout("slow"), httpx.ConnectError("down"), httpx.RemoteProtocolError("lost"),
])
def test_exhausted_network_errors_are_returned(waits, error):
    send = MagicMock(side_effect=error)
    assert call_with_retries(send, DEFAULT_POLICY) == (None, error, 4)
    assert send.call_count == 4
    assert waits == [1, 2, 4]


def test_zero_retries(waits):
    response = httpx.Response(503)
    policy = {**DEFAULT_POLICY, "retry_count": 0, "retry_backoff_seconds": []}
    send = MagicMock(return_value=response)
    assert call_with_retries(send, policy) == (response, None, 1)
    assert waits == []


def test_retry_closes_failed_stream_before_next_attempt(waits):
    stream = MagicMock(status_code=503)
    success = MagicMock(status_code=200)
    def send():
        if stream.close.called:
            return success
        return stream
    assert call_with_retries(send, DEFAULT_POLICY) == (success, None, 2)
    stream.close.assert_called_once()
    success.close.assert_not_called()
