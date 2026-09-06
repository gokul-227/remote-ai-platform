"""
Global Exception Handlers for FastAPI.
"""

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.schemas import ErrorDetail, ErrorResponse

logger = structlog.get_logger(__name__)


class PlatformException(Exception):  # noqa: N818
    """Base domain exception."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        code: str = "ERROR",
    ):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(message)


class NotFoundException(PlatformException):
    def __init__(self, resource: str, id: str | int | None = None):
        detail = f"{resource} not found" if id is None else f"{resource} with id '{id}' not found"
        super().__init__(detail, status.HTTP_404_NOT_FOUND, "NOT_FOUND")


class UnauthorizedException(PlatformException):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED")


class ForbiddenException(PlatformException):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, status.HTTP_403_FORBIDDEN, "FORBIDDEN")


class ConflictException(PlatformException):
    def __init__(self, message: str):
        super().__init__(message, status.HTTP_409_CONFLICT, "CONFLICT")


class AIUnavailableException(PlatformException):
    """Raised when an AI-powered action fails because every LLM provider/fallback is down.

    Maps to 503 so the client can distinguish "AI genuinely unavailable, please retry" from a
    real validation/auth error -- never present as a 200 with placeholder data.
    """

    def __init__(self, message: str = "AI service is temporarily unavailable. Please retry shortly."):
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE, "AI_UNAVAILABLE")


# Aliases for domain code compatibility
NotFoundError = NotFoundException
AuthenticationError = UnauthorizedException
AuthorizationError = ForbiddenException
DuplicateError = ConflictException


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(PlatformException)
    async def platform_exception_handler(request: Request, exc: PlatformException):
        logger.warning("Domain exception", message=exc.message, code=exc.code)
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(error=exc.message).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        details = [
            ErrorDetail(
                field=".".join(str(loc) for loc in err.get("loc", [])),
                message=err.get("msg", "Validation error"),
                code="VALIDATION_ERROR",
            )
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=ErrorResponse(
                error="Validation failed",
                details=details,
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception", exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(error="Internal server error").model_dump(),
        )
