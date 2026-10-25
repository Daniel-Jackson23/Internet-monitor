# Build the web frontend
FROM node:22-alpine AS web
WORKDIR /src
COPY shared ./shared
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

# Python backend, serving the API and the built frontend
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY monitor.py .
COPY --from=web /src/web/dist ./web/dist

ENV DATA_DIR=/data PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8090

CMD ["python", "monitor.py"]
