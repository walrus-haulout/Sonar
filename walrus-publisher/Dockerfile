FROM python:3.13-slim as builder

# Install UV
RUN pip install --no-cache-dir uv

WORKDIR /app
COPY pyproject.toml uv.lock* ./

# Create virtual environment and install dependencies
RUN uv venv /opt/venv && \
    /opt/venv/bin/uv pip install --no-cache-dir -e .

# Runtime stage
FROM python:3.13-slim

# Install Sui CLI (pre-built binary)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://releases.sui.io/sui-latest-ubuntu-x86_64.tgz | tar -xz -C /usr/local/bin

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY src ./src
COPY config ./config

# Set environment
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["fastapi", "run", "src/main.py", "--port", "8080", "--host", "0.0.0.0"]
