"""
Pydantic schemas for Admin Domain.
"""

import uuid
from datetime import datetime
from typing import Dict, List, Optional
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
