"""
Shared Pydantic response schemas and error models.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

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
