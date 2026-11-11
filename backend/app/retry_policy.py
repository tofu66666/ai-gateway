"""Per-alias settings and provider retry handling."""

from typing import Annotated
from time import sleep

import httpx

from pydantic import BaseModel, ConfigDict, Field, model_validator

DEFAULT_POLICY = {
    "retry_count": 3,
    "retry_backoff_seconds": [1, 2, 4],
    "timeout_seconds": 30,
}
POLICY_COLUMNS = ",".join(DEFAULT_POLICY)


class ResiliencePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    retry_count: int = Field(ge=0)
    retry_backoff_seconds: list[Annotated[float, Field(ge=0, allow_inf_nan=False)]]
    timeout_seconds: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def matching_backoffs(self):
        if len(self.retry_backoff_seconds) != self.retry_count:
            raise ValueError("Provide one backoff for each retry")
        return self


def policy_from_row(row: dict) -> dict:
    return {name: row.get(name, default) for name, default in DEFAULT_POLICY.items()}


def call_with_retries(send, policy: dict):
    """Return the final response, HTTP error and number of upstream attempts."""
    for index in range(policy["retry_count"] + 1):
        response, error = None, None
        try:
            response = send()
            retryable = response.status_code in (429, 500, 502, 503, 504)
        except httpx.HTTPError as exc:
            error = exc
            retryable = isinstance(exc, (
                httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError,
            ))
        if not retryable or index == policy["retry_count"]:
            return response, error, index + 1
        if response is not None:
            response.close()
        sleep(policy["retry_backoff_seconds"][index])
