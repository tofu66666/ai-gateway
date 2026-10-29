from unittest.mock import MagicMock, call
import pytest
from app import request_log

KEY = {"user_id": "u1", "project_id": "p1", "model_ids": ["m1"]}
MODEL = {"id": "m1", "price_per_1m_input": 0.10, "price_per_1m_output": 0.40}

def usage(prompt, completion):
    return {"usage":{"prompt_tokens":prompt,"completion_tokens":completion}}

def test_get_usage():
    assert request_log.get_usage(usage(1000,500))==(1000,500)

# Every types are wrong: get usage=(0,0)
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"usage":None},
        {"usage":"oops"},
        None,
        [],
        "text",
    ],
)
def test_get_usage_with_missing_or_wrong_type(payload):
    
    assert request_log.get_usage(payload)==(0,0)

# Bad counts : get usage =(0,0)
@pytest.mark.parametrize("bad",[None,-1,True,1.5,"10"])
def test_get_usage_ignores_bad_counts(bad):
    
    assert request_log.get_usage(usage(bad,bad))==(0,0)

def build(payload, status_code=200, latency_ms=123, model=MODEL):
    return request_log.build_record(
        key=KEY, model=model, payload=payload, status_code=status_code, latency_ms=latency_ms
    )

# All the values are valid:
def test_build_record_success():
    record=build(usage(1000, 500))
    
    assert record.pop("cost")== pytest.approx(0.0003)
    assert record=={
        "project_id": "p1",
        "model_id": "m1",
        "user_id": "u1",
        "input_tokens": 1000,
        "output_tokens": 500,
        "status": "200",
        "latency": 123,
    }

# If the status_code > 400 (failed comunication): no tokens, no cost
def test_build_record_failed():
    record = build(usage(1000, 500), status_code=429)

    assert record["input_tokens"] == 0
    assert record["output_tokens"] == 0
    assert record["cost"] == 0
    assert record["status"] == "429"

#Empty record would return only the columns
def test_build_record_db():
    assert set(build({}))=={
        "project_id" ,
        "model_id" ,
        "user_id" ,
        "input_tokens" ,
        "output_tokens",
        "cost",
        "status",
        "latency",
    }


# Valid for status_code < 400
def test_build_record_status():

    assert build(usage(10,10), status_code=399)["input_tokens"]==10
    assert build(usage(10,10), status_code=400)["input_tokens"]==0


def call_log_request(status_code=200):
    return request_log.log_request(
        key=KEY, model=MODEL, payload=usage(1000,500),
        status_code=status_code, latency_ms=50,
    )

# Null price -> cost 0
def test_build_record_null_price():
    record=build(usage(1000,500), model={"id":"m1","price_per_1m_input": None, "price_per_1m_output": None })

    assert record["cost"]==0
    assert record["input_tokens"]==1000

# All valid
def test_log_request_success(monkeypatch):
    # Assume that the project already spent 1.5 USD
    fake=MagicMock()
    monkeypatch.setattr(request_log, "supabase", fake)

    # Create request_log
    call_log_request()

    # Only access requests table
    # spend go through rpc(remote procedure call)
    assert fake.table.call_args_list==[call("requests")]
    assert fake.table.return_value.insert.call_count==1
    assert fake.table.return_value.insert.call_args==call({
        "project_id":"p1" ,
        "model_id":"m1" ,
        "user_id":"u1" ,
        "input_tokens":1000 ,
        "output_tokens":500,
        "cost":pytest.approx(0.0003),
        "status":"200",
        "latency":50,
    })

# failed case
def test_log_request_failed(monkeypatch):
    fake=MagicMock()
    monkeypatch.setattr(request_log, "supabase", fake)

    # Create request_log with failed communication
    call_log_request(status_code=429)

    assert fake.table.call_args_list==[call("requests")]
    assert fake.table.return_value.insert.call_args==call({
        "project_id":"p1" ,
        "model_id":"m1" ,
        "user_id":"u1" ,
        "input_tokens":0 ,
        "output_tokens":0,
        "cost":0,
        "status":"429",
        "latency":50,
    })
    # failed status_code -> stop before calling project
    assert fake.rpc.call_count==0

# zero cost: skips spend
def test_log_request_zero_cost(monkeypatch):
    fake=MagicMock()
    monkeypatch.setattr(request_log,"supabase", fake)

    request_log.log_request(key=KEY, model=MODEL, payload={}, status_code=200,latency_ms=50)

    assert fake.table.call_args_list==[call("requests")]
    assert fake.rpc.call_count==0

# If database is down, we expect that log_request doesn't raise error outside. 
def test_log_request_never_raises(monkeypatch):
    fake=MagicMock()
    fake.table.side_effect=RuntimeError("database down")
    monkeypatch.setattr(request_log, "supabase", fake)

    call_log_request() # Nothing happen: try~except Exception put log in server and keep quite

# In the rpc error case, what happens with request table
def test_log_request_rpc_failure_never_raises(monkeypatch):
    fake=MagicMock()
    fake.rpc.side_effect=RuntimeError("function add_spend does not exist")
    monkeypatch.setattr(request_log, "supabase", fake)

    call_log_request() # Not raise? / When fail rpc, the request table is inserted succesfully?
    assert fake.table.return_value.insert.call_count==1 # request table is inserted => count ==1

# Check log request return request_id 
def test_log_request_return_rid(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[{"id":"r1"}]
    monkeypatch.setattr(request_log, "supabase", fake)

    assert call_log_request()=="r1"

# Check log request return request id for failed request and does not use rpc
def test_log_request_return_rid_for_failed(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[{"id":"r2"}]
    monkeypatch.setattr(request_log, "supabase", fake)

    assert call_log_request(status_code=429)=="r2"
    assert fake.rpc.call_count==0

# Case that add_spend fails
def test_log_request_keeps_id_when_spend_update_fails(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[{"id":"r3"}]
    fake.rpc.side_effect=RuntimeError("funcion add_spend does not exist")
    monkeypatch.setattr(request_log, "supabase", fake)

    assert call_log_request()=="r3" # Exisiting row means that the request id still returned.

# Case that insert fails
def test_log_request_returns_none_when_insert_fails(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[{"id":"r4"}]
    fake.table.side_effect=RuntimeError("database down")
    monkeypatch.setattr(request_log, "supabase", fake)

    assert call_log_request() is None

# Request Id and key id test

def test_record_additional_column():
    record=request_log.build_record(
        key={**KEY, "key_id": "k1"},
        model=MODEL,
        payload=usage(1000, 500),
        status_code=200,
        latency_ms=50,
        request_id="r-1",
    )

    assert record["id"]=="r-1" and record["key_id"]=="k1"
    plain=build(usage(1,1))
    assert not {"id", "key_id"} & set(plain)

def test_log_request_saves_under_the_id_given(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[{"id":"r-1"}]
    monkeypatch.setattr(request_log, "supabase", fake)

    saved=request_log.log_request(
        key={**KEY, "key_id":"k1"},
        model=MODEL,
        payload=usage(1000, 500),
        status_code=200,
        latency_ms=50,
        request_id="r-1",
    )

    sent=fake.table.return_value.insert.call_args.args[0]
    assert saved=="r-1"
    assert sent["id"]=="r-1" and sent["key_id"]=="k1"

def test_log_request_return_given_id_even_db_not_return_row(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.return_value.data=[]
    monkeypatch.setattr(request_log, "supabase", fake)

    saved=request_log.log_request(
        key=KEY,
        model=MODEL,
        payload={},
        status_code=200,
        latency_ms=5,
        request_id="r-9",
    )

    assert saved=="r-9"

def test_log_request_returns_none_when_insert_fails_2(monkeypatch):
    fake=MagicMock()
    fake.table.return_value.insert.return_value.execute.side_effect=RuntimeError("no such column")
    monkeypatch.setattr(request_log, "supabase", fake)

    assert request_log.log_request(
        key=KEY, 
        model=MODEL, 
        payload={}, 
        status_code=200,
        latency_ms=5,
        request_id="r-9",
    ) is None

