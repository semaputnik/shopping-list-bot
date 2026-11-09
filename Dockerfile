# syntax=docker/dockerfile:1.7
# One image for both processes: `shopping-list-bot serve` (default: API + built Mini App) and `shopping-list-bot bot`.

FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ ./src/
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.14-slim-bookworm AS runtime
RUN useradd --create-home --uid 10001 app && mkdir -p /data && chown app /data
WORKDIR /app
COPY --from=backend --chown=app /app/.venv /app/.venv
COPY --from=frontend --chown=app /src/frontend/dist /app/frontend/dist
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    SL_DATABASE_URL=sqlite:////data/shared_lists.db \
    SL_FRONTEND_DIST=/app/frontend/dist
USER app
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"]
CMD ["shopping-list-bot", "serve"]
