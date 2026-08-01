"""
AI Matching Domain Package
"""

from app.domains.matching.models import JobMatch
from app.domains.matching.schemas import JobMatchResponse, MatchStatusUpdate
from app.domains.matching.repository import MatchingRepository
from app.domains.matching.service import MatchingService
from app.domains.matching.router import router

__all__ = [
    "JobMatch",
    "JobMatchResponse",
    "MatchStatusUpdate",
    "MatchingRepository",
    "MatchingService",
    "router",
]
