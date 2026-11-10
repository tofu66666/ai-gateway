# H18IALMOND-37 load balancing: choose which deployment serves a request.
# The counts live in this process. Running several workers would need them in
# Redis, or each worker would balance on its own.
# The cooldown is the small part of H18IALMOND-23 this story needs; retries and
# per-alias settings stay with that ticket.

import threading
import time
from collections import defaultdict

FAILURE_LIMIT = 3
FAILURE_WINDOW_SECONDS = 60
COOLDOWN_SECONDS = 60


class LoadBalancer:
    def __init__(self, clock=time.monotonic):
        self._clock = clock
        # Sync endpoints run in a thread pool, so every count sits behind the lock.
        # Reentrant because the garbage collector can close a hung-up stream, which
        # calls release(), on a thread that is already inside acquire().
        self._lock = threading.RLock()
        self._turns = defaultdict(int)
        self._in_flight = defaultdict(int)
        self._failures = defaultdict(list)
        self._cooling_until = {}

    def acquire(
        self, alias_id: str, deployments: list[dict], strategy: str | None
    ) -> dict | None:
        """Choose a deployment outside cooldown and count it as busy until release()."""
        with self._lock:
            available = [
                d for d in deployments if self._cooldown_left(d["id"]) == 0
            ]
            if not available:
                return None
            start = self._turns[alias_id] % len(available)
            self._turns[alias_id] += 1
            # Starting from the next turn makes least_busy share out ties evenly
            rotated = available[start:] + available[:start]
            choice = rotated[0]
            if strategy == "least_busy":
                choice = min(rotated, key=lambda d: self._in_flight[d["id"]])
            self._in_flight[choice["id"]] += 1
            return choice

    def release(self, deployment_id: str) -> None:
        with self._lock:
            self._in_flight[deployment_id] -= 1

    def in_flight(self, deployment_id: str) -> int:
        with self._lock:
            return self._in_flight[deployment_id]

    def record_failure(self, deployment_id: str) -> None:
        """Too many failures in the window take the deployment out for a cooldown."""
        with self._lock:
            # Requests already running when the cooldown began must not extend it
            if self._cooldown_left(deployment_id) > 0:
                return
            now = self._clock()
            recent = [
                failed_at
                for failed_at in self._failures[deployment_id]
                if now - failed_at < FAILURE_WINDOW_SECONDS
            ]
            recent.append(now)
            if len(recent) >= FAILURE_LIMIT:
                self._cooling_until[deployment_id] = now + COOLDOWN_SECONDS
                recent = []
            self._failures[deployment_id] = recent

    def cooldown_left(self, deployment_id: str) -> float:
        """Seconds until the deployment is back in rotation; 0 if it already is."""
        with self._lock:
            return self._cooldown_left(deployment_id)

    def _cooldown_left(self, deployment_id: str) -> float:
        # Callers hold the lock
        until = self._cooling_until.get(deployment_id, 0)
        return max(until - self._clock(), 0)


balancer = LoadBalancer()
