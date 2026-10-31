# Sharing an alias across deployments on POST /chat/completions (H18IALMOND-37)
# Supabase and the provider are fake, as in test_gateway.py

from collections import Counter
from unittest.mock import MagicMock

import httpx

from app import load_balancer
from app.routers import gateway
from tests.test_gateway import (
    MODEL,
    USAGE_REPLY,
    fake_auth,
    fake_log,
    post,
)

EAST = {
    "id": "d-east",
    "provider": "openai",
    "model": "gpt-east",
    "base_url": "https://east.test/v1",
    "api_key_env": None,
}
WEST = {
    "id": "d-west",
    "provider": "openai",
    "model": "gpt-west",
    "base_url": "https://west.test/v1",
    "api_key_env": None,
}
TWO = [EAST, WEST]
ERROR = {"error": {"message": "failed"}}


def record_calls(monkeypatch, response=None):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append({"url": url, "model": json["model"]})
        return response or httpx.Response(200, json=USAGE_REPLY)

    monkeypatch.setattr(gateway.httpx, "post", fake_post)
    return calls


def test_requests_alternate_between_deployments(monkeypatch):
    fake_auth(monkeypatch, deployments=TWO)
    fake_log(monkeypatch)
    calls = record_calls(monkeypatch)

    for _ in range(4):
        assert post().status_code == 200

    assert [c["url"] for c in calls] == [
        "https://east.test/v1/chat/completions",
        "https://west.test/v1/chat/completions",
    ] * 2


def test_deployment_model_name_is_sent(monkeypatch):
    fake_auth(monkeypatch, deployments=TWO)
    fake_log(monkeypatch)
    calls = record_calls(monkeypatch)

    post()
    post()

    assert [c["model"] for c in calls] == ["gpt-east", "gpt-west"]


def test_each_request_records_its_deployment(monkeypatch):
    fake_auth(monkeypatch, deployments=TWO)
    logged = fake_log(monkeypatch)
    record_calls(monkeypatch)

    post()
    post()

    assert [row["deployment_id"] for row in logged] == ["d-east", "d-west"]


def test_alias_strategy_reaches_the_balancer(monkeypatch):
    fake_auth(
        monkeypatch, model={**MODEL, "routing_strategy": "least_busy"}, deployments=TWO
    )
    fake_log(monkeypatch)
    calls = record_calls(monkeypatch)
    # A request stuck on east leaves west as the least busy
    load_balancer.balancer.acquire("other", [EAST], "round_robin")

    post()
    post()

    assert Counter(c["model"] for c in calls) == {"gpt-west": 2}


def test_get_deployments_reads_active_rows_in_order(monkeypatch):
    fake = MagicMock()
    query = fake.table.return_value.select.return_value.eq.return_value.eq.return_value
    query.order.return_value.execute.return_value.data = TWO
    monkeypatch.setattr(gateway, "supabase", fake)

    assert gateway.get_deployments("m1") == TWO

    fake.table.assert_called_once_with("model_deployments")
    fake.table.return_value.select.return_value.eq.assert_called_once_with("model_id", "m1")
    fake.table.return_value.select.return_value.eq.return_value.eq.assert_called_once_with(
        "enabled", True
    )
    query.order.assert_called_once_with("position")
