# Production Dockerfile for SONAR Backend (Railway deployment)
# Optimized for monorepo with Prisma and workspace dependencies

# Stage 1: Dependencies
FROM oven/bun:1.1-slim as deps

WORKDIR /app

# Copy workspace root files
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Install all dependencies (including dev deps for Prisma)
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM oven/bun:1.1-slim as builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY backend ./backend

# Generate Prisma Client
WORKDIR /app/backend
RUN bunx prisma generate

# Stage 3: Production Runtime
FROM oven/bun:1.1-slim

WORKDIR /app

# Install production dependencies only
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

RUN bun install --frozen-lockfile --production

# Copy built artifacts and source
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun run --eval "try { const r = await fetch('http://localhost:3001/health'); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"

WORKDIR /app/backend

# Run migrations and start server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/index.ts"]
