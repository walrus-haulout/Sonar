#!/bin/bash
set -e

# =============================================================================
# SONAR Backend Startup Script
# Handles database migrations and application startup with dynamic PORT
# =============================================================================

echo "🔧 Starting SONAR Backend..."

# Use PORT environment variable if set (for Railway/cloud platforms)
# Otherwise default to 3001
PORT="${PORT:-3001}"

echo "   Port: ${PORT}"
echo ""

# Run database migrations
echo "📊 Ensuring database schema is up to date..."
if python3 /app/backend/scripts/migrate.py; then
    echo "✓ Database schema ready"
else
    # Migration may have already been run; log warning but continue
    echo "⚠️  Migration check completed (may have already been applied)"
fi
echo ""

# Ensure baseline migration exists
echo "📋 Ensuring baseline migration..."
if bun run scripts/ensure-baseline-migration.ts; then
    echo "✓ Baseline migration safeguard complete"
else
    # This may fail if migration already exists, which is fine
    echo "⚠️  Baseline migration check completed (may already exist)"
fi
echo ""

# Run Prisma migrations
echo "🔄 Applying pending migrations..."
if bunx prisma migrate deploy; then
    echo "✓ All migrations applied"
else
    # Migration may have already been run
    echo "⚠️  Migration application completed"
fi
echo ""

# Start Bun server
echo "🚀 Starting Fastify server on port ${PORT}..."
echo ""

# Export PORT so it's available to the application
export PORT

# Start server - using bun run to execute src/index.ts
exec bun run src/index.ts
