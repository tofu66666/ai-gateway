# Test stream : on POST /chat/completions and request_text, response_text logging

import json
import threading
import time
import httpx
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app import guardrails, load_balancer, request_log, retry_policy
from app.load_balancer import LoadBalancer
from app.routers import gateway

client=TestClient(app)
AUTH={"Authorization": "Bearer vktest"}
MODEL={"id":"m1", "alias":"mq", "provider":"google", "model":"gemini-x"}
KEY={"user_id":"u1", "project_id":"p1","model_ids":["m1"]}
BODY={"model":"mq", "stream": True, "messages":[{"role": "user", "content": "hi"}]}

def one_deployment():
    # Read MODEL when called, so tests that change its provider change this too
    return {"id":"d1", "provider":MODEL["provider"], "model":MODEL["model"], "base_url":None, "api_key_env":None}

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
    monkeypatch.setattr(retry_policy, "sleep", lambda seconds: None)
    monkeypatch.setitem(app.dependency_overrides, gateway.require_budget_available, lambda: KEY)
    monkeypatch.setattr(gateway, "get_allowed_models", lambda ids: [MODEL])
    monkeypatch.setattr(gateway, "model_exists", lambda name: True)
    monkeypatch.setattr(guardrails, "get_project_guardrails",
                        lambda project_id: {"blocked_patterns": [], "max_tokens_cap": None})
    monkeypatch.setattr(gateway, "get_deployments", lambda model_id: [one_deployment()])
    monkeypatch.setattr(load_balancer, "balancer", LoadBalancer())
    logged=[]
    monkeypatch.setattr(request_log, "log_request", lambda **a: logged.append(a))
    sent={}

    def provide(stream=None, error=None):
        sent["calls"]=0
        def fake_open(deployment, endpoint, body, timeout=None):
            sent["calls"]+=1
            sent.update(deployment=deployment, endpoint=endpoint, body=body, timeout=timeout)
            if error:
                raise error
            return stream
        monkeypatch.setattr(gateway, "open_stream", fake_open)
    return logged, sent, provide

def do_post(body=BODY):
    return client.post("/chat/completions", json=body, headers=AUTH)

GOOD=[chunk("Hel"), "", chunk("lo"), "", chunk(finish="stop"), "",
      chunk(usage={"prompt_tokens": 10, "completion_tokens": 5}), "", "data: [DONE]", ""]

@pytest.mark.parametrize("failure", [None, 503, httpx.ConnectError("down")])
def test_stream_returns_sse_ending_with_done(stream_setup, monkeypatch, failure):
    logged, sent, provide=stream_setup
    stream=FakeStream(GOOD)
    model={**MODEL, "retry_count": 1, "retry_backoff_seconds": [0.25], "timeout_seconds": 7}
    monkeypatch.setattr(gateway, "get_allowed_models", lambda ids: [model])
    waits=[]
    monkeypatch.setattr(retry_policy, "sleep", waits.append)
    failure=FakeStream([], status=503) if failure==503 else failure
    send=MagicMock(side_effect=[failure, stream] if failure is not None else [stream])
    monkeypatch.setattr(gateway, "open_stream", send)
    r=do_post()
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["x-request-id"]==logged[0]["request_id"]
    assert r.text.rstrip().endswith("data: [DONE]")
    assert "Hel" in r.text and "lo" in r.text
    assert stream.closed
    attempts=1 if failure is None else 2
    assert send.call_count==attempts and len(logged)==1
    assert logged[0]["attempt_count"]==attempts
    assert waits==[0.25]*(attempts-1)
    assert {call.kwargs["timeout"] for call in send.call_args_list}=={7}
    if isinstance(failure, FakeStream):
        assert failure.closed
    assert load_balancer.balancer.in_flight("d1")==0
    assert load_balancer.balancer.cooldown_left("d1")==0

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
    assert sent["calls"]==1 and len(logged)==1
    assert logged[0]["attempt_count"]==1

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
    assert sent["calls"]==4 and len(logged)==1
    assert logged[0]["attempt_count"]==4
    assert load_balancer.balancer.in_flight("d1")==0

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
    resp=gateway.send_to_prov_stream({"model": "x"}, MODEL, one_deployment(), KEY, "hi")

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


def test_stream_strips_usage_that_shares_a_chunk_with_content(stream_setup):
    # Gemini can put the usage in the last content chunk
    logged, sent, provide=stream_setup
    both="data:"+json.dumps({
        "choices":[{"delta": {"content": "hi"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1},
    })
    provide(FakeStream([both, "", "data: [DONE]", ""]))
    r=do_post()
    assert "prompt_tokens" not in r.text # hidden from the caller
    assert '"hi"' in r.text # The content is still there
    assert r.text.rstrip().endswith("data: [DONE]")
    assert logged[0]["payload"]=={"usage": {"prompt_tokens": 3, "completion_tokens": 1}} # but still priced
    assert logged[0]["response_text"]=="hi"

def test_stream_keeps_usage_in_a_content_chunk_when_caller_asked(stream_setup):
    logged, sent, provide=stream_setup
    both="data:"+json.dumps({
        "choices":[{"delta": {"content": "hi"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1},
    })
    provide(FakeStream([both, "", "data: [DONE]", ""]))
    r=do_post({**BODY, "stream_options": {"include_usage": True}})
    assert "prompt_tokens" in r.text

def test_stream_provider_refuses_with_non_json_body(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream([], status=503, body=b"<html>down</html>"))
    r=do_post()
    assert r.status_code==503
    assert r.json()["error"]["message"]=="Provider returned an error"
    assert logged[0]["status_code"]==503

def test_caller_hangup_is_logged_on_its_own_thread(stream_setup, monkeypatch):
    # The thread that closes a hung-up stream may be in the middle of another
    # Supabase call (the garbage collector closes it), so it must not log there.
    import asyncio
    logged, sent, provide=stream_setup
    threads=[]
    monkeypatch.setattr(request_log, "log_request",
                        lambda **a: threads.append(threading.current_thread().name))
    provide(FakeStream(GOOD))
    resp=gateway.send_to_prov_stream({"model": "x"}, MODEL, one_deployment(), KEY, "hi")

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


# H18IALMOND-37: streams go through the load balancer like other requests

def deployment(name):
    return {**one_deployment(), "id": f"d-{name}"}

class BusyCheck(FakeStream):
    # Records how busy the deployment is while the stream is being read
    def iter_lines(self):
        self.busy=load_balancer.balancer.in_flight("d1")
        yield from super().iter_lines()

def test_stream_logs_its_deployment(stream_setup):
    logged, sent, provide=stream_setup
    provide(FakeStream(GOOD))
    do_post()
    assert sent["deployment"]["id"]=="d1"
    assert logged[0]["deployment_id"]=="d1"

def test_streams_take_turns_across_deployments(stream_setup, monkeypatch):
    logged, sent, provide=stream_setup
    monkeypatch.setattr(gateway, "get_deployments", lambda model_id: [deployment("east"), deployment("west")])
    used=[]
    for _ in range(4):
        provide(FakeStream(GOOD))
        do_post()
        used.append(sent["deployment"]["id"])
    assert used==["d-east", "d-west", "d-east", "d-west"]

def test_deployment_stays_busy_until_the_stream_ends(stream_setup):
    logged, sent, provide=stream_setup
    stream=BusyCheck(GOOD)
    provide(stream)
    do_post()
    assert stream.busy==1
    assert load_balancer.balancer.in_flight("d1")==0

@pytest.mark.parametrize("make_stream", [
    lambda: FakeStream([chunk("a"), ""], fail=httpx.RemoteProtocolError("lost")),
    lambda: FakeStream([], status=500, body=b'{"error": {"message": "down"}}'),
])
def test_failed_streams_put_the_deployment_in_cooldown(stream_setup, make_stream):
    logged, sent, provide=stream_setup
    for _ in range(3):
        provide(make_stream())
        do_post()
    assert load_balancer.balancer.cooldown_left("d1")>0
    assert load_balancer.balancer.in_flight("d1")==0
    assert do_post().status_code==503

def test_caller_hangup_frees_the_deployment_without_a_failure(stream_setup):
    import asyncio, gc
    logged, sent, provide=stream_setup
    provide(FakeStream(GOOD))
    chosen=load_balancer.balancer.acquire("m1", [one_deployment()], None)
    resp=gateway.send_to_prov_stream({"model": "x"}, MODEL, chosen, KEY, "hi")

    async def read_one_then_leave():
        it=resp.body_iterator
        await it.__anext__()
        await it.aclose()

    asyncio.run(read_one_then_leave())
    del resp
    gc.collect()
    assert load_balancer.balancer.in_flight("d1")==0
    assert load_balancer.balancer.cooldown_left("d1")==0

