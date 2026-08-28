"""
Pydantic schemas for Admin Domain.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict


class PlatformStatsResponse(BaseModel):
    total_users: int
    total_engineers: int
    total_companies: int
    total_jobs: int
    total_active_jobs: int
    total_matches: int
    job_sources_breakdown: Dict[str, int]
    system_health: str = "HEALTHY"


class UserStatusUpdate(BaseModel):
    is_active: bool


class JobStatusUpdate(BaseModel):
    is_active: bool


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Dict[str, Any]
    created_at: datetime


class ApiSyncLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: str
    jobs_fetched: int
    jobs_inserted: int
    jobs_updated: int
    status: str
    error_message: Optional[str] = None
    duration_ms: int
    created_at: datetime


class AIUsageStatsResponse(BaseModel):
    total_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    model_breakdown: Dict[str, int]
    feature_breakdown: Dict[str, int]


class ServiceHealthStatus(BaseModel):
    service: str
    status: str  # OPERATIONAL, DEGRADED, DOWN
    latency_ms: Optional[float] = None
    details: Optional[str] = None


class SystemHealthDetailResponse(BaseModel):
    overall_status: str
    services: List[ServiceHealthStatus]
    timestamp: datetime


class DisputeResolveRequest(BaseModel):
    decision: str  # RELEASE_TO_WORKER, REFUND_TO_CLIENT, SPLIT
    worker_amount: Optional[float] = None
    client_amount: Optional[float] = None
    resolution_notes: str


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None
    actor_role: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    payload: Dict[str, Any]
    created_at: datetime
