"""Fake OpenAI-compatible provider for load tests (H18IALMOND-37).

Give each deployment its own path, e.g. base_url http://stub-provider:9100/fast/v1.
STUB_DELAYS sets how slow each one answers, e.g. "fast=0.01,slow=0.2" (seconds).
GET /counts shows the requests each path received. POST /reset clears them.
"""

import json
import os
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPLY = {
    "choices": [{"message": {"role": "assistant", "content": "stub reply"}}],
    "usage": {"prompt_tokens": 1, "completion_tokens": 1},
}


def parse_delays(text: str) -> dict[str, float]:
    delays = {}
    for pair in text.split(","):
        if pair.strip():
            name, seconds = pair.split("=")
            delays[name.strip()] = float(seconds)
    return delays


def make_handler(delays: dict[str, float]):
    counts = Counter()
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def send_json(self, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            with lock:
                self.send_json(dict(counts))

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/reset":
                with lock:
                    counts.clear()
                self.send_json({})
                return
            name = self.path.split("/")[1]
            time.sleep(delays.get(name, 0))
            with lock:
                counts[name] += 1
            self.send_json(REPLY)

        def log_message(self, format, *args):
            pass  # A load test would flood the logs

    return Handler


def make_server(port: int, delays: dict[str, float]) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("0.0.0.0", port), make_handler(delays))


if __name__ == "__main__":
    port = int(os.getenv("STUB_PORT", "9100"))
    make_server(port, parse_delays(os.getenv("STUB_DELAYS", ""))).serve_forever()
