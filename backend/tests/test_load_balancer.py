# Choosing a deployment (H18IALMOND-37)

import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from app.load_balancer import COOLDOWN_SECONDS, LoadBalancer

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


# Cooldown


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def fail(balancer, deployment_id, times=3):
    for _ in range(times):
        balancer.record_failure(deployment_id)


def test_deployment_in_cooldown_is_skipped():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a")

    assert picks(balancer, [A, B, C], "round_robin", 4) == list("bcbc")


def test_least_busy_skips_deployment_in_cooldown():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a")

    assert set(picks(balancer, [A, B], "least_busy", 4)) == {"b"}


def test_two_failures_do_not_start_a_cooldown():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a", times=2)

    assert balancer.cooldown_left("a") == 0


def test_old_failures_fall_out_of_the_window():
    clock = Clock()
    balancer = LoadBalancer(clock=clock)
    fail(balancer, "a", times=2)
    clock.now += 61
    balancer.record_failure("a")

    assert balancer.cooldown_left("a") == 0


def test_failures_are_counted_per_deployment():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a", times=2)
    balancer.record_failure("b")

    assert balancer.cooldown_left("a") == 0
    assert balancer.cooldown_left("b") == 0


def test_deployment_returns_after_the_cooldown():
    clock = Clock()
    balancer = LoadBalancer(clock=clock)
    fail(balancer, "a")
    assert balancer.cooldown_left("a") == COOLDOWN_SECONDS

    clock.now += COOLDOWN_SECONDS

    assert balancer.cooldown_left("a") == 0
    assert picks(balancer, [A, B], "round_robin", 2) == list("ab")


def test_late_failures_do_not_extend_the_cooldown():
    clock = Clock()
    balancer = LoadBalancer(clock=clock)
    fail(balancer, "a")

    clock.now += 30
    fail(balancer, "a")

    assert balancer.cooldown_left("a") == COOLDOWN_SECONDS - 30


def test_a_returning_deployment_starts_with_no_failures():
    clock = Clock()
    balancer = LoadBalancer(clock=clock)
    fail(balancer, "a")
    clock.now += COOLDOWN_SECONDS

    balancer.record_failure("a")

    assert balancer.cooldown_left("a") == 0


def test_all_deployments_in_cooldown():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a")
    fail(balancer, "b")

    assert balancer.acquire("alias", [A, B], "round_robin") is None


def test_release_from_inside_acquire_does_not_deadlock():
    # The garbage collector can close a hung-up stream, whose release() then runs
    # on a thread that already holds the lock inside acquire()
    balancer = LoadBalancer()
    balancer.acquire("alias", [B], "round_robin")
    released = []

    def clock():
        if not released:
            released.append(True)
            balancer.release("b")
        return 0

    balancer._clock = clock
    picked = []
    worker = threading.Thread(
        target=lambda: picked.append(balancer.acquire("alias", [A], "round_robin")),
        daemon=True,
    )
    worker.start()
    worker.join(timeout=2)

    assert picked == [A]
    assert balancer.in_flight("b") == 0


def test_ordered_always_takes_the_first():
    assert picks(LoadBalancer(), [A, B, C], "ordered", 4) == list("aaaa")


def test_ordered_skips_a_deployment_in_cooldown():
    balancer = LoadBalancer(clock=Clock())
    fail(balancer, "a")

    assert picks(balancer, [A, B, C], "ordered", 4) == list("bbbb")


def test_ordered_returns_to_the_first_after_its_cooldown():
    clock = Clock()
    balancer = LoadBalancer(clock=clock)
    fail(balancer, "a")
    assert balancer.cooldown_left("a") == COOLDOWN_SECONDS
    assert picks(balancer, [A, B], "ordered", 2) == list("bb")

    clock.now += COOLDOWN_SECONDS

    assert balancer.cooldown_left("a") == 0
    assert picks(balancer, [A, B], "ordered", 2) == list("aa")