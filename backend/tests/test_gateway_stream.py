# Test stream : on POST /chat/completions and request_text, response_text logging

import json
import threading
import time
import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import guardrails, request_log
from app.routers import gateway

client=TestClient(app)
AUTH={"Authorization": "Bearer vktest"}
MODEL={"id":"m1", "alias":"mq", "provider":"google", "model":"gemini-x"}
KEY={"user_id":"u1", "project_id":"p1","model_ids":["m1"]}
BODY={"model":"mq", "stream": True, "messages":[{"role": "user", "content": "hi"}]}

def chunk(text=None, usage=None, finish=None):
    c={"choices":[]}
    if text is not None or finish:
        c["choices"]=[{"delta":{"content": text} if text is not None else {}, "finish_reason": finish}]
    if usage:
        c["usage"]=usage
    return "data: "+json.dumps(c)

class FakeStream:
    # lines: list of SSE lines. 
    # fail: an exception raised after the lines
    def __init__(self, lines, status=200, fail=None, body=b""):
        self.lines, self.status_code, self.fail, self.body = lines, status, fail, body
        self.closed=False

    def iter_lines(self):
        for line in self.lines:
            yield line
        if self.fail:
            raise self.fail

    def read(self):
        return self.body

    def close(self):
        self.closed=True

@pytest.fixture
def stream_setup(monkeypatch):
    monkeypatch.setitem(app.dependency_overrides, gateway.require_budget_available, lambda: KEY)
    monkeypatch.setattr(gateway, "get_allowed_models", lambda ids: [MODEL])
    monkeypatch.setattr(gateway, "model_exists", lambda name: True)
    monkeypatch.setattr(guardrails, "get_project_guardrails",
                        lambda project_id: {"blocked_patterns": [], "max_tokens_cap": None})
    logged=[]
    monkeypatch.setattr(request_log, "log_request", lambda **a: logged.append(a))
    sent={}

    def provide(stream=None, error=None):
        def fake_open(provider, endpoint, body):
            sent.update(provider=provider, endpoint=endpoint, body=body)
            if error:
                raise error
            return stream
        monkeypatch.setattr(gateway, "open_stream", fake_open)
    return logged, sent, provide

def do_post(body=BODY):
    return client.post("/chat/completions", json=body, headers=AUTH)

GOOD=[chunk("Hel"), "", chunk("lo"), "", chunk(finish="stop"), "",
      chunk(usage={"prompt_tokens": 10, "completion_tokens": 5}), "", "data: [DONE]", ""]

def test_stream_returns_sse_ending_with_done(stream_setup):
    logged, sent, provide=stream_setup
    stream=FakeStream(GOOD)
    provide(stream)
    r=do_post()
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["x-request-id"]==logged[0]["request_id"]
    assert r.text.rstrip().endswith("data: [DONE]")
    assert "Hel" in r.text and "lo" in r.text
    assert stream.closed

def test_stream_asks_usage_and_hides_it_when_not_requested(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream(GOOD))
    r=do_post()
    assert sent["body"]["stream_options"]=={"include_usage": True}
    assert sent["body"]["model"]=="gemini-x"
    assert "prompt_tokens" not in r.text   # hidden from the caller
    assert "\n\n\n" not in r.text   # and its blank line is gone too
    assert logged[0]["payload"]=={"usage": {"prompt_tokens": 10, "completion_tokens": 5}}


def test_stream_keeps_usage_when_caller_asked(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream(GOOD))
    r=do_post({**BODY, "stream_options": {"include_usage": True}})
    assert "prompt_tokens" in r.text


def test_stream_logs_ttft_status_and_text(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream(GOOD))
    do_post()
    log=logged[0]
    assert log["status_code"]==200
    assert log["time_to_first_token_ms"] is not None
    assert log["latency_ms"]>=log["time_to_first_token_ms"]
    assert log["request_text"]=="hi"
    assert log["response_text"]=="Hello"


def test_stream_adds_done_when_provider_forgot(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream([chunk("a"), ""]))
    assert do_post().text.rstrip().endswith("data: [DONE]")

def test_stream_provider_without_usage_support_is_not_asked(stream_setup, monkeypatch):
    logged, sent, provide=stream_setup
    monkeypatch.setitem(MODEL, "provider", "anthropic")
    try:
        provide(FakeStream(GOOD))
        do_post()
        assert "stream_options" not in sent["body"]
    finally:
        monkeypatch.setitem(MODEL, "provider", "google")

@pytest.mark.parametrize("error,status,msg", [
    (httpx.ReadTimeout("t"), 504, "timed out"),
    (httpx.RemoteProtocolError("lost"), 502, "connection was lost"),
])
def test_stream_failure_midstream_sends_error_event_and_logs_error(stream_setup, error, status, msg):
    logged, sent, provide=stream_setup
    stream=FakeStream([chunk("par"), ""], fail=error)
    provide(stream)
    r=do_post()
    assert r.status_code==200 # headers were already sent
    assert msg in r.text and '"provider_error"' in r.text
    assert r.text.rstrip().endswith("data: [DONE]")
    assert logged[0]["status_code"]==status
    assert logged[0]["response_text"] is None
    assert stream.closed

def test_stream_error_chunk_from_provider_is_logged_as_error(stream_setup):
    logged, sent, provide=stream_setup
    err='data: {"error": {"message": "boom"}}'
    provide(FakeStream([chunk("a"), "", err, ""]))
    r=do_post()
    assert "boom" in r.text
    assert logged[0]["status_code"]==502

def test_stream_provider_refuses_before_streaming(stream_setup):
    logged, sent, provide=stream_setup
    stream=FakeStream([], status=429, body=b'{"error": {"message": "slow down"}}')
    provide(stream)
    r=do_post()
    assert r.status_code==429
    assert r.json()["error"]["message"]=="slow down"
    assert logged[0]["status_code"]==429
    assert stream.closed

def test_stream_provider_auth_error_is_hidden(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream([], status=401, body=b'{"error": {"message": "bad key sk-123"}}'))
    r=do_post()
    assert r.status_code==502
    assert "sk-123" not in r.text

@pytest.mark.parametrize("error,status", [(httpx.ConnectTimeout("t"), 504), (httpx.ConnectError("c"), 502)])
def test_stream_cannot_connect(stream_setup, error, status):
    logged, sent, provide=stream_setup
    provide(error=error)
    assert do_post().status_code==status
    assert logged[0]["status_code"]==status

def test_stream_only_on_chat(stream_setup):
    logged, sent, provide=stream_setup
    from app.routers.gateway import send_req
    with pytest.raises(gateway.HTTPException) as e:
        send_req("completions", {"model": "mq", "stream": True, "prompt": "x"}, KEY)
    assert e.value.status_code==400

def test_stream_master_prompt_applied_but_not_stored_as_request_text(stream_setup, monkeypatch):
    logged, sent, provide=stream_setup
    monkeypatch.setitem(MODEL, "prompt", "Be brief")
    try:
        provide(FakeStream(GOOD))
        do_post()
        assert sent["body"]["messages"][0]=={"role": "system", "content": "Be brief"}
        assert logged[0]["request_text"]=="hi"
    finally:
        MODEL.pop("prompt")

def wait_for(items, timeout=1.0):
    # A hung-up stream is logged by the stream-log thread, a moment later
    end=time.monotonic()+timeout
    while not items and time.monotonic()<end:
        time.sleep(0.01)

def test_caller_hangup_is_logged_499(stream_setup):
    import asyncio
    logged, sent, provide=stream_setup
    stream=FakeStream(GOOD)
    provide(stream)
    resp=gateway.send_to_prov_stream({"model": "x"}, MODEL, KEY, "hi")

    async def read_one_then_leave():
        it=resp.body_iterator
        await it.__anext__()
        await it.aclose()   # what Starlette does when the caller disconnects

    asyncio.run(read_one_then_leave())
    import gc
    del resp
    gc.collect()
    wait_for(logged)
    assert logged[-1]["status_code"] == 499
    assert stream.closed

def test_caller_hangup_is_logged_on_its_own_thread(stream_setup, monkeypatch):
    # The thread that closes a hung-up stream may be in the middle of another
    # Supabase call (the garbage collector closes it), so it must not log there.
    import asyncio
    logged, sent, provide=stream_setup
    threads=[]
    monkeypatch.setattr(request_log, "log_request",
                        lambda **a: threads.append(threading.current_thread().name))
    provide(FakeStream(GOOD))
    resp=gateway.send_to_prov_stream({"model": "x"}, MODEL, KEY, "hi")

    async def read_one_then_leave():
        it=resp.body_iterator
        await it.__anext__()
        await it.aclose()

    asyncio.run(read_one_then_leave())
    import gc
    del resp
    gc.collect()
    wait_for(threads)
    assert threads==["stream-log"]
