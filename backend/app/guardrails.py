# H18IALMOND-39 guardrails: stop blocked prompts and oversized requests
# before they reach a provider. Settings live on the projects row.

from app.routers.db import supabase

TOKEN_FIELDS = ("max_tokens", "max_completion_tokens")


class GuardrailViolation(Exception):
    """The request broke a project guardrail; the message is safe to return."""


def get_project_guardrails(project_id: str) -> dict:
    rows = (
        supabase.table("projects")
        .select("blocked_patterns,max_tokens_cap")
        .eq("id", project_id)
        .limit(1)
        .execute()
        .data
    )
    row = rows[0] if rows else {}
    return {
        "blocked_patterns": row.get("blocked_patterns") or [],
        "max_tokens_cap": row.get("max_tokens_cap"),
    }


def prompt_texts(body: dict) -> list[str]:
    # Message content is a string or a list of parts like {"type": "text", "text": ...}
    texts = []
    messages = body.get("messages")
    if not isinstance(messages, list):
        return texts
    for message in messages:
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if isinstance(content, str):
            texts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    texts.append(part["text"])
    return texts


def find_blocked_pattern(body: dict, patterns: list[str]) -> str | None:
    # Plain phrases, matched anywhere in a message, ignoring case
    phrases = [p.casefold() for p in patterns if p and p.strip()]
    for text in prompt_texts(body):
        folded = text.casefold()
        for phrase in phrases:
            if phrase in folded:
                return phrase
    return None


def apply_max_tokens_cap(body: dict, cap: int | None) -> dict:
    # Reject a request above the cap; fill the cap in when the client sent none
    if cap is None:
        return body
    sent = False
    for field in TOKEN_FIELDS:
        value = body.get(field)
        if value is None:
            continue
        sent = True
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise GuardrailViolation(f"{field} must be a positive integer")
        if value > cap:
            raise GuardrailViolation(
                f"{field} {value} is above this project's cap of {cap}"
            )
    if sent:
        return body
    return {**body, "max_tokens": cap}


def check_request(body: dict, guardrails: dict) -> dict:
    """Return the body to send on, or raise GuardrailViolation."""
    if find_blocked_pattern(body, guardrails.get("blocked_patterns") or []):
        raise GuardrailViolation(
            "Request blocked by project policy: the prompt contains a blocked phrase"
        )
    return apply_max_tokens_cap(body, guardrails.get("max_tokens_cap"))
