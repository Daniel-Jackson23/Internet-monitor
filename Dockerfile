FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Copy dependencies file and install packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

# Explicitly run the script using shell-style CMD
CMD ["python", "monitor.py"]

