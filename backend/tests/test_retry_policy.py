from unittest.mock import MagicMock

import httpx
import pytest

from app import retry_policy
from app.retry_policy import DEFAULT_POLICY, call_with_retries, policy_from_row, without_retries


@pytest.fixture
def waits(monkeypatch):
    values = []
    monkeypatch.setattr(retry_policy, "sleep", values.append)
    return values


@pytest.mark.parametrize("outcome,attempts", [
    (429, 4), (500, 4), (502, 4), (503, 4), (504, 4),
    (200, 1), (400, 1), (401, 1), (403, 1), (404, 1), (422, 1),
    (httpx.ReadTimeout("slow"), 4), (httpx.ConnectError("down"), 4),
    (httpx.RemoteProtocolError("lost"), 4),
])
def test_retry_decisions_and_attempt_limit(waits, outcome, attempts):
    error = outcome if isinstance(outcome, httpx.HTTPError) else None
    response = None if error is not None else httpx.Response(outcome)
    send = MagicMock(side_effect=error, return_value=response)
    assert call_with_retries(send, DEFAULT_POLICY) == (response, error, attempts)
    assert send.call_count == attempts
    assert waits == [1, 2, 4][:attempts-1]


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


def test_without_retries_returns_a_copy_and_keeps_the_original():
    row = {"id": "alias-1", **DEFAULT_POLICY}
    result = without_retries(row)

    # Retries are off in the copy
    assert result["retry_count"] == 0
    assert result["retry_backoff_seconds"] == []
    # Everything else is kept
    assert result["id"] == "alias-1"
    assert result["timeout_seconds"] == DEFAULT_POLICY["timeout_seconds"]
    # The original row is untouched
    assert row["retry_count"] == DEFAULT_POLICY["retry_count"]
    assert row["retry_backoff_seconds"] == DEFAULT_POLICY["retry_backoff_seconds"]


@pytest.mark.parametrize("outcome", [
    429, 500, 503, httpx.ReadTimeout("slow"),
    httpx.ConnectError("down"),
])
def test_without_retries_tries_once_and_does_not_wait(waits, outcome):
    error = outcome if isinstance(outcome, httpx.HTTPError) else None
    response = None if error is not None else httpx.Response(outcome)
    send = MagicMock(side_effect=error, return_value=response)
    policy = policy_from_row(without_retries({"id": "alias-1", **DEFAULT_POLICY}))

    assert call_with_retries(send, policy) == (response, error, 1)
    assert send.call_count == 1
    assert waits == []