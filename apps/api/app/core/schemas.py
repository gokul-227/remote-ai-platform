"""
Shared Pydantic response schemas and error models.
"""

from typing import Annotated, Generic, TypeVar
from urllib.parse import urlsplit

from pydantic import BaseModel, BeforeValidator, Field

DataT = TypeVar("DataT")


class APIResponse(BaseModel, Generic[DataT]):
    """Standard API response envelope."""

    success: bool = True
    data: DataT | None = None
    message: str | None = None


class PaginatedResponse(BaseModel, Generic[DataT]):
    """Paginated list response."""

    items: list[DataT]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @classmethod
    def from_items(
        cls,
        items: list[DataT],
        total: int,
        page: int,
        page_size: int,
    ) -> "PaginatedResponse[DataT]":
        total_pages = max(1, (total + page_size - 1) // page_size)
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str
    code: str | None = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: list[ErrorDetail] | None = None
    request_id: str | None = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    environment: str
    services: dict[str, str] = Field(default_factory=dict)


def _http_url(value: object) -> str | None:
    """Accept only http(s) links; a bare host gets https://. Anything else
    (javascript:, data:, ...) is rejected so it can never reach an href/src."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be a URL")
    url = value.strip()
    if not url:
        return None
    if len(url) > 2048:
        raise ValueError("URL is too long")
    if "://" not in url and ":" not in url.split("/", 1)[0]:
        url = f"https://{url}"
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        raise ValueError("must be an http:// or https:// link")
    return url


# For request (input) schemas only: response schemas must not re-validate
# stored data, or one legacy value would make reading the record fail.
HttpUrlIn = Annotated[str | None, BeforeValidator(_http_url)]
