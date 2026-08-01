"""
Pydantic schemas for Admin Domain.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel


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
