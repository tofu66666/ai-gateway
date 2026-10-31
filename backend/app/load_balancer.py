# H18IALMOND-37 load balancing: choose which deployment serves a request.
# The counts live in this process. Running several workers would need them in
# Redis, or each worker would balance on its own.

import threading
import time
from collections import defaultdict


class LoadBalancer:
    def __init__(self):
        # Sync endpoints run in a thread pool, so every count sits behind the lock
        self._lock = threading.Lock()
        self._turns = defaultdict(int)
        self._in_flight = defaultdict(int)

    def acquire(
        self, alias_id: str, deployments: list[dict], strategy: str | None
    ) -> dict | None:
        """Choose a deployment and count it as busy until release()."""
        with self._lock:
            if not deployments:
                return None
            start = self._turns[alias_id] % len(deployments)
            self._turns[alias_id] += 1
            # Starting from the next turn makes least_busy share out ties evenly
            rotated = deployments[start:] + deployments[:start]
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


balancer = LoadBalancer()
