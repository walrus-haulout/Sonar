# =============================================================================
# SONAR Backend Dockerfile
# Multi-stage Debian build for Railway deployment
# =============================================================================
# Production deployment for Fastify/TypeScript backend with Prisma ORM
# Uses Debian (node:20-slim) for standard library compatibility

# Stage 1: Dependencies
FROM node:20-slim AS deps

WORKDIR /app

# Install Bun and runtime dependencies
# bun: JavaScript runtime (Zig-based, faster than Node)
# curl: health check support
# postgresql-client: Prisma PostgreSQL support
# openssl: required for OpenSSL 3.0.x binaries
# ca-certificates: required for curl HTTPS verification
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    postgresql-client \
    openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun

# Copy workspace root files
COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/seal/package.json ./packages/seal/
COPY backend/package.json ./backend/

# Install all dependencies (including dev deps for Prisma)
RUN bun install --frozen-lockfile

# Stage 2: Builder - Generate Prisma client
FROM deps AS builder

# Copy source code
COPY packages/shared ./packages/shared
COPY backend ./backend

# Generate Prisma Client
# Prisma auto-detects the correct binary target for Debian
WORKDIR /app/backend
RUN bunx prisma generate

# Stage 3: Runtime image
FROM node:20-slim AS runner

# Install runtime dependencies
# curl: health check support
# postgresql-client: Prisma PostgreSQL support
# openssl: required for OpenSSL 3.0.x binaries
# ca-certificates: required for curl HTTPS verification
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    postgresql-client \
    openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

# Copy dependencies and built artifacts from builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy startup scripts
COPY backend/scripts/start.sh /app/backend/start.sh
COPY backend/scripts/migrate.py /app/backend/migrate.py

# Create non-root user and set permissions
RUN useradd -m -u 1000 backend && \
    chown -R backend:backend /app && \
    chmod +x /app/backend/start.sh /app/backend/migrate.py

# Set production environment
ENV NODE_ENV=production

USER backend
ENV HOME=/home/backend
WORKDIR /app/backend

# Expose port (Railway injects actual PORT via environment variable)
EXPOSE 3001

# Health check (respects PORT env var for Railway/cloud platforms)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run --eval "try { const r = await fetch('http://localhost:' + (process.env.PORT || '3001') + '/health'); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"

# Start server using start.sh script (handles PORT env var and migrations)
CMD ["/app/backend/start.sh"]
