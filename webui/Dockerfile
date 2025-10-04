FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend files
COPY webui/frontend/package*.json ./
RUN npm install

COPY webui/frontend/ ./
RUN npm run build

# Python backend stage
FROM python:3.11-slim

# Install PowerShell
RUN apt-get update && apt-get install -y \
    wget \
    apt-transport-https \
    software-properties-common \
    && wget -q https://packages.microsoft.com/config/debian/11/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y powershell \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY webui/backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend
COPY webui/backend/ ./backend/

# Copy Posterizarr scripts
COPY Posterizarr.ps1 ./
COPY config.example.json ./config.json
COPY *.png ./
COPY *.ttf ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p /app/Logs /app/assets /app/temp

# Expose ports
EXPOSE 8000 3000

# Start backend server
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
