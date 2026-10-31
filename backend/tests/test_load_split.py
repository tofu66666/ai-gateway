# Load test: real HTTP to a stub provider, Supabase faked (H18IALMOND-37)
# backend/loadtest/split_test.py runs the same check against the live stack

import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import pytest

from app import load_balancer
from loadtest.stub_provider import make_server
from tests.test_gateway import MODEL, fake_auth, fake_log, post

REQUESTS = 200
CONCURRENCY = 8


@pytest.fixture
def stub():
    server = make_server(0, {"fast": 0.002, "slow": 0.05})
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def deployment(stub, name):
    return {
        "id": f"d-{name}",
        "provider": "openai",
        "model": "stub-model",
        "base_url": f"{stub}/{name}/v1",
        "api_key_env": None,
    }


def run_load(monkeypatch, strategy, deployments, cooling=()):
    fake_auth(
        monkeypatch, model={**MODEL, "routing_strategy": strategy}, deployments=deployments
    )
    logged = fake_log(monkeypatch)
    for deployment_id in cooling:
        for _ in range(3):
            load_balancer.balancer.record_failure(deployment_id)

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        statuses = list(pool.map(lambda _: post().status_code, range(REQUESTS)))

    assert statuses == [200] * REQUESTS
    return Counter(row["deployment_id"] for row in logged)


def test_round_robin_splits_requests_evenly(monkeypatch, stub):
    two = [deployment(stub, "fast"), deployment(stub, "slow")]

    split = run_load(monkeypatch, "round_robin", two)

    assert split == {"d-fast": 100, "d-slow": 100}


def test_least_busy_sends_more_to_the_faster_deployment(monkeypatch, stub):
    two = [deployment(stub, "fast"), deployment(stub, "slow")]

    split = run_load(monkeypatch, "least_busy", two)

    assert sum(split.values()) == REQUESTS
    assert split["d-fast"] > split["d-slow"] * 3


def test_deployment_in_cooldown_gets_no_load(monkeypatch, stub):
    two = [deployment(stub, "fast"), deployment(stub, "slow")]

    split = run_load(monkeypatch, "round_robin", two, cooling=["d-slow"])

    assert split == {"d-fast": REQUESTS}
