# Remote AI Platform — FastAPI Dockerfile
# Multi-stage build for development and production targets

# ─── Base ─────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps

COPY pyproject.toml ./
RUN pip install hatchling && pip install -e ".[dev]"

# ─── Development ──────────────────────────────────────────────────────────────
FROM deps AS development

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production-deps

COPY pyproject.toml ./
RUN pip install hatchling && pip install -e "."

FROM production-deps AS production

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
