FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine ./engine

# Cloud Run sets $PORT. One worker: the pipeline runs in threads and the
# poll loop must not be duplicated across processes.
CMD ["sh", "-c", "uvicorn engine.server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
