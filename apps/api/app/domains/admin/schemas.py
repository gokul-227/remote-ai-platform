"""
Pydantic schemas for Admin Domain.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.domains.auth.models import UserRole


class PlatformStatsResponse(BaseModel):
    total_users: int
    total_engineers: int
    total_companies: int
    total_jobs: int
    total_active_jobs: int
    total_matches: int
    job_sources_breakdown: dict[str, int]
    system_health: str = "HEALTHY"


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserRoleUpdate(BaseModel):
    role: UserRole


class JobStatusUpdate(BaseModel):
    is_active: bool


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    details: dict[str, Any]
    created_at: datetime


class ApiSyncLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: str
    jobs_fetched: int
    jobs_inserted: int
    jobs_updated: int
    status: str
    error_message: str | None = None
    duration_ms: int
    created_at: datetime


class AIUsageStatsResponse(BaseModel):
    total_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    model_breakdown: dict[str, int]
    feature_breakdown: dict[str, int]


class ServiceHealthStatus(BaseModel):
    service: str
    status: str  # OPERATIONAL, DEGRADED, DOWN
    latency_ms: float | None = None
    details: str | None = None


class SystemHealthDetailResponse(BaseModel):
    overall_status: str
    services: list[ServiceHealthStatus]
    timestamp: datetime


class FeatureFlagsResponse(BaseModel):
    flags: dict[str, bool]


class DisputeResolveRequest(BaseModel):
    decision: str  # RELEASE_TO_WORKER, REFUND_TO_CLIENT, SPLIT
    worker_amount: float | None = None
    client_amount: float | None = None
    resolution_notes: str


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_role: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    payload: dict[str, Any]
    created_at: datetime
