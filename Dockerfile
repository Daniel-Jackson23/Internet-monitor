FROM python:3.11-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Uncomment if you want .env baked into the container
# COPY .env .

CMD ["python", "monitor.py"]
