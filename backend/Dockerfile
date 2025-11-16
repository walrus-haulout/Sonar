# =============================================================================
# SONAR Backend Dockerfile
# Multi-stage build using Nix for reproducible, minimal builds
# =============================================================================
# Production deployment for Fastify/TypeScript backend with Prisma ORM
# Uses NixOS base for consistent dependencies across services

# Stage 1: Dependencies - Uses NixOS for reproducible builds
FROM nixos/nix:latest AS deps

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

WORKDIR /app

# Install Bun and dependencies via Nix (Bun available in nixpkgs)
# curl is needed for health checks, coreutils for standard utilities
RUN nix-env -iA nixpkgs.bun nixpkgs.curl nixpkgs.coreutils

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

WORKDIR /app

# Copy source code
COPY packages/shared ./packages/shared
COPY backend ./backend

# Generate Prisma Client
WORKDIR /app/backend
RUN bunx prisma generate

# Stage 3: Runtime image
FROM nixos/nix:latest AS runner

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

# Install Bun and runtime dependencies via nix-env
# Includes postgresql client libraries for Prisma, bash for scripts
RUN nix-env -iA nixpkgs.bun nixpkgs.curl nixpkgs.coreutils nixpkgs.postgresql nixpkgs.bash

# Create /bin/bash symlink for script execution
# NixOS minimal image doesn't have /bin/bash by default
RUN mkdir -p /bin && \
    BASH_PATH=$(which bash || echo "") && \
    if [ -n "$BASH_PATH" ]; then \
        ln -sf "$BASH_PATH" /bin/bash || cp "$BASH_PATH" /bin/bash; \
    else \
        echo "❌ Error: bash not found after installation" && exit 1; \
    fi

WORKDIR /app

# Copy dependencies and built artifacts from builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy setup and startup scripts
COPY backend/scripts/setup_user.py /tmp/setup_user.py
COPY backend/scripts/start.sh /app/backend/start.sh
COPY backend/scripts/migrate.py /app/backend/migrate.py

# Create non-root user for runtime using Python script
RUN python3 /tmp/setup_user.py && \
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
