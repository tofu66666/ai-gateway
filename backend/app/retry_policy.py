"""Per-alias settings and provider retry handling."""

from typing import Annotated

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
