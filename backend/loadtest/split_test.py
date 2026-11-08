"""Send concurrent requests through the gateway and show how they split.

Start the stub with `docker compose --profile loadtest up -d`, point an alias's
deployments at it, then run this with a virtual key allowed to use that alias:

    docker compose exec backend python loadtest/split_test.py --key mq-k_... --model my-alias
"""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import httpx


def send_requests(gateway: str, key: str, model: str, total: int, concurrency: int) -> Counter:
    url = f"{gateway}/chat/completions"
    headers = {"Authorization": f"Bearer {key}"}
    body = {"model": model, "messages": [{"role": "user", "content": "hi"}]}

    def one_request(_):
        return httpx.post(url, json=body, headers=headers, timeout=60).status_code

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return Counter(pool.map(one_request, range(total)))


def share_lines(counts: dict[str, int]) -> list[str]:
    total = sum(counts.values())
    return [
        f"{name}: {count} ({count / total:.1%})" for name, count in sorted(counts.items())
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--key", required=True, help="virtual key")
    parser.add_argument("--model", required=True, help="alias to test")
    parser.add_argument("--gateway", default="http://localhost:8000")
    parser.add_argument("--stub", default="http://stub-provider:9100")
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()

    httpx.post(f"{args.stub}/reset").raise_for_status()
    statuses = send_requests(
        args.gateway, args.key, args.model, args.requests, args.concurrency
    )
    print("Gateway responses:", dict(statuses))
    counts = httpx.get(f"{args.stub}/counts").raise_for_status().json()
    if not counts:
        raise SystemExit("The stub received no requests")
    print("Requests per deployment:")
    for line in share_lines(counts):
        print(" ", line)


if __name__ == "__main__":
    main()
