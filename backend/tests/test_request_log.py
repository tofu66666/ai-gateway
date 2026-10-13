from unittest.mock import MagicMock, call
import pytest
from app import request_log

KEY = {"user_id": "u1", "project_id": "p1", "model_ids": ["m1"]}
MODEL = {"id": "m1", "price_per_1m_input": 0.10, "price_per_1m_output": 0.40}

def usage(prompt, completion):
    return {"usage":{"prompt_tokens":prompt,"completion_tokens":completion}}

def test_get_usage():
    assert request_log.get_usage(usage(1000,500))==(1000,500)

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
# Every types are wrong: get usage=(0,0)
def test_get_usage_with_missing_or_wrong_type(payload):
    assert request_log.get_usage(payload)==(0,0)

@pytest.mark.parametrize("bad",[None,-1,True,1.5,"10"])
# Bad counts : get usage =(0,0)
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

# If the status_code > 400 (failed comunication)
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

def make_fake(spend_rows):
    fake=MagicMock()
    (fake.table.return_value
    .select.return_value
    .eq.return_value
    .limit.return_value
    .execute.return_value
    .data)=spend_rows
    return fake

def call_log_request(status_code=200):
    request_log.log_request(
        key=KEY, model=MODEL, payload=usage(1000,500),
        status_code=status_code, latency_ms=50,
    )

# All valid
def test_log_request_success(monkeypatch):
    # Assume that the project already spent 1.5 USD
    fake=make_fake([{"spend_this_month":1.5}])
    monkeypatch.setattr(request_log, "supabase", fake)
    insert=fake.table.return_value.insert
    update=fake.table.return_value.update


    # Create request_log
    call_log_request()

    # Check the order of call of table
    assert fake.table.call_args_list==[
        call("requests"),
        call("projects"),
        call("projects"),
    ]

    # Inserted value check in request table
    assert insert.call_count==1
    assert insert.call_args==call({
        "project_id":"p1" ,
        "model_id":"m1" ,
        "user_id":"u1" ,
        "input_tokens":1000 ,
        "output_tokens":500,
        "cost":pytest.approx(0.0003),
        "status":"200",
        "latency":50,
    })

    # Have read in p1 spent
    assert fake.table.return_value.select.return_value.eq.call_args==(call("id","p1"))
    # Have written in p1 project spent once
    assert update.call_count==1
    assert update.call_args == call({"spend_this_month": pytest.approx(1.5003)})
    assert update.return_value.eq.call_args==call("id","p1")

# failed case
def test_log_request_failed(monkeypatch):
    # Assume that the project already spent 1.5 USD
    fake=make_fake([{"spend_this_month":1.5}])
    monkeypatch.setattr(request_log, "supabase", fake)
    insert=fake.table.return_value.insert
    update=fake.table.return_value.update


    # Create request_log with failed communication
    call_log_request(status_code=429)

    # Check the order of call of table will be only request
    # failed status_code -> stop before calling project
    assert fake.table.call_args_list==[
        call("requests"),
    ]

    # Inserted value check in request table
    assert insert.call_count==1
    assert insert.call_args==call({
        "project_id":"p1" ,
        "model_id":"m1" ,
        "user_id":"u1" ,
        "input_tokens":0 ,
        "output_tokens":0,
        "cost": 0,
        "status":"429",
        "latency":50,
    })

    # There was no updates
    assert update.call_count == 0