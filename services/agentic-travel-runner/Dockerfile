# Full AgenticAI travel generator (Python). Deploy to Cloud Run in the same GCP
# project / VPC as the lab Snowflake egress path, or run locally for testing.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY py/ /app/py/
COPY server.py /app/server.py

ENV PYTHONPATH=/app/py
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
