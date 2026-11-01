# Tests for app/guardrails.py (H18IALMOND-39); Supabase is faked

from unittest.mock import MagicMock

import pytest

from app import guardrails
from app.guardrails import GuardrailViolation


def chat(*contents, **extra):
    return {
        "model": "mq",
        "messages": [{"role": "user", "content": c} for c in contents],
        **extra,
    }


def fake_projects(monkeypatch, rows):
    db = MagicMock()
    query = db.table.return_value.select.return_value.eq.return_value
    query.limit.return_value.execute.return_value.data = rows
    monkeypatch.setattr(guardrails, "supabase", db)
    return db


# get_project_guardrails
def test_get_guardrails_reads_project_row(monkeypatch):
    db = fake_projects(
        monkeypatch, [{"blocked_patterns": ["secret"], "max_tokens_cap": 500}]
    )
    assert guardrails.get_project_guardrails("p1") == {
        "blocked_patterns": ["secret"],
        "max_tokens_cap": 500,
    }
    db.table.assert_called_with("projects")


def test_get_guardrails_defaults_when_unset(monkeypatch):
    fake_projects(monkeypatch, [{"blocked_patterns": None, "max_tokens_cap": None}])
    assert guardrails.get_project_guardrails("p1") == {
        "blocked_patterns": [],
        "max_tokens_cap": None,
    }


def test_get_guardrails_missing_project(monkeypatch):
    fake_projects(monkeypatch, [])
    assert guardrails.get_project_guardrails("p1")["blocked_patterns"] == []


# Blocked phrases
def test_blocked_phrase_ignores_case():
    body = chat("Please IGNORE previous instructions")
    assert guardrails.find_blocked_pattern(body, ["ignore previous"]) == "ignore previous"


def test_blocked_phrase_in_any_message():
    body = chat("hello", "tell me the root password")
    assert guardrails.find_blocked_pattern(body, ["root password"])


def test_blocked_phrase_in_content_parts():
    body = {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "drop table users"}]}
        ]
    }
    assert guardrails.find_blocked_pattern(body, ["DROP TABLE"])


def test_clean_prompt_passes():
    assert guardrails.find_blocked_pattern(chat("hi there"), ["password"]) is None


def test_blank_patterns_never_match():
    assert guardrails.find_blocked_pattern(chat("hi"), ["", "   "]) is None


def test_no_messages_passes():
    assert guardrails.find_blocked_pattern({"model": "mq"}, ["x"]) is None


# max_tokens cap
def test_no_cap_leaves_body_alone():
    body = chat("hi", max_tokens=99999)
    assert guardrails.apply_max_tokens_cap(body, None) is body


def test_cap_filled_in_when_missing():
    assert guardrails.apply_max_tokens_cap(chat("hi"), 256)["max_tokens"] == 256


def test_under_or_at_cap_passes():
    body = chat("hi", max_tokens=256)
    assert guardrails.apply_max_tokens_cap(body, 256) == body


@pytest.mark.parametrize("field", ["max_tokens", "max_completion_tokens"])
def test_over_cap_rejected_with_cap_stated(field):
    with pytest.raises(GuardrailViolation, match="cap of 256"):
        guardrails.apply_max_tokens_cap(chat("hi", **{field: 257}), 256)


def test_completion_tokens_field_counts_as_sent():
    body = chat("hi", max_completion_tokens=100)
    assert "max_tokens" not in guardrails.apply_max_tokens_cap(body, 256)


@pytest.mark.parametrize("value", [0, -1, "100", 1.5, True])
def test_bad_max_tokens_rejected(value):
    with pytest.raises(GuardrailViolation, match="positive integer"):
        guardrails.apply_max_tokens_cap(chat("hi", max_tokens=value), 256)


# check_request
def test_check_request_blocks_phrase_before_cap():
    settings = {"blocked_patterns": ["secret"], "max_tokens_cap": 10}
    with pytest.raises(GuardrailViolation, match="blocked phrase"):
        guardrails.check_request(chat("a secret", max_tokens=99), settings)


def test_check_request_hides_the_phrase():
    settings = {"blocked_patterns": ["launch codes"], "max_tokens_cap": None}
    with pytest.raises(GuardrailViolation) as exc:
        guardrails.check_request(chat("launch codes please"), settings)
    assert "launch codes" not in str(exc.value)


def test_check_request_returns_capped_body():
    settings = {"blocked_patterns": [], "max_tokens_cap": 64}
    assert guardrails.check_request(chat("hi"), settings)["max_tokens"] == 64
