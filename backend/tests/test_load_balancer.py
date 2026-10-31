# Choosing a deployment (H18IALMOND-37)

from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from app.load_balancer import LoadBalancer

A = {"id": "a"}
B = {"id": "b"}
C = {"id": "c"}


def picks(balancer, deployments, strategy, times):
    # Each pick finishes before the next one starts
    chosen = []
    for _ in range(times):
        choice = balancer.acquire("alias", deployments, strategy)
        balancer.release(choice["id"])
        chosen.append(choice["id"])
    return chosen


def test_round_robin_takes_turns():
    assert picks(LoadBalancer(), [A, B, C], "round_robin", 6) == list("abcabc")


def test_turns_are_counted_per_alias():
    balancer = LoadBalancer()
    assert balancer.acquire("one", [A, B], "round_robin") == A
    assert balancer.acquire("two", [A, B], "round_robin") == A


def test_unknown_strategy_takes_turns():
    assert picks(LoadBalancer(), [A, B], None, 4) == list("abab")


def test_no_deployments():
    assert LoadBalancer().acquire("alias", [], "round_robin") is None


def test_least_busy_avoids_the_busy_deployment():
    balancer = LoadBalancer()
    balancer.acquire("other", [A], "round_robin")
    balancer.acquire("other", [A], "round_robin")

    assert picks(balancer, [A, B], "least_busy", 3) == ["b", "b", "b"]


def test_least_busy_counts_requests_still_running():
    balancer = LoadBalancer()
    first = balancer.acquire("alias", [A, B], "least_busy")
    second = balancer.acquire("alias", [A, B], "least_busy")

    assert {first["id"], second["id"]} == {"a", "b"}


def test_least_busy_shares_ties_evenly():
    assert Counter(picks(LoadBalancer(), [A, B], "least_busy", 10)) == {"a": 5, "b": 5}


def test_release_frees_the_deployment():
    balancer = LoadBalancer()
    balancer.acquire("alias", [A], "round_robin")
    assert balancer.in_flight("a") == 1

    balancer.release("a")

    assert balancer.in_flight("a") == 0


def test_round_robin_split_is_exact_across_threads():
    balancer = LoadBalancer()

    def one_request(_):
        choice = balancer.acquire("alias", [A, B], "round_robin")
        balancer.release(choice["id"])
        return choice["id"]

    with ThreadPoolExecutor(max_workers=16) as pool:
        chosen = Counter(pool.map(one_request, range(1000)))

    assert chosen == {"a": 500, "b": 500}
    assert balancer.in_flight("a") == 0 and balancer.in_flight("b") == 0
