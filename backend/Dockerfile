FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN --mount=type=cache,target=/root/.cache/pip PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple pip install --timeout 120 --retries 5 .

EXPOSE 8000

CMD ["uvicorn", "aninexus_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
