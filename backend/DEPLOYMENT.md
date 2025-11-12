# SONAR Backend Deployment Guide (Railway)

This guide covers deploying the SONAR backend API to Railway.

## Prerequisites

- Railway account (https://railway.app)
- PostgreSQL database (can be provisioned on Railway)
- Environment variables configured

## Railway Deployment Steps

### 1. Create a New Railway Project

```bash
# Install Railway CLI (optional)
npm i -g @railway/cli

# Login to Railway
railway login
```

### 2. Provision PostgreSQL Database

In Railway dashboard:
1. Click "New Project"
2. Select "Provision PostgreSQL"
3. Railway will create a database and provide `DATABASE_URL`

### 3. Deploy Backend Service

#### Option A: Using Railway CLI

```bash
# From the repository root
railway link

# Deploy from backend directory
cd backend
railway up
```

#### Option B: Using GitHub Integration

1. Connect your GitHub repository to Railway
2. Set the **Root Directory** to `backend`
3. Railway will auto-detect the Dockerfile

### 4. Configure Environment Variables

In Railway dashboard, add these environment variables:

#### Required Variables

```bash
# Server
NODE_ENV=production
PORT=3001

# Database (auto-provided by Railway if using their PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Authentication
JWT_SECRET=<generate-secure-random-string>
JWT_EXPIRES_IN=24h

# Blockchain (Sui)
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SONAR_PACKAGE_ID=<your-deployed-contract-package-id>
SONAR_MARKETPLACE_ID=<your-marketplace-object-id>

# Walrus Storage
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
MOCK_WALRUS=false

# Seal Network
SEAL_NETWORK_URL=https://seal.testnet.mysten.com
MOCK_SEAL=false

# Logging
LOG_LEVEL=info

# CORS (add your frontend URLs)
CORS_ORIGIN=https://your-frontend.vercel.app,https://your-domain.com
```

#### Optional Variables

```bash
# Observability
SENTRY_DSN=<your-sentry-dsn>

# Walrus Publisher (if different from aggregator)
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
```

### 5. Generate JWT Secret

```bash
# Generate a secure random string for JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 6. Database Migrations

Migrations run automatically on deployment via the Dockerfile CMD:
```bash
bunx prisma migrate deploy && bun run src/index.ts
```

If you need to run migrations manually:
```bash
railway run bunx prisma migrate deploy
```

### 7. Verify Deployment

Check the deployment:

1. **Health Check**: Visit `https://your-backend.railway.app/health`
   - Should return: `{"status":"ok","database":true,...}`

2. **Logs**: Check Railway logs for any errors
   ```bash
   railway logs
   ```

## Environment-Specific Configuration

### Development
- Use `MOCK_WALRUS=true` and `MOCK_SEAL=true` for testing without Walrus/Seal
- Set `SONAR_PACKAGE_ID=0x0` to skip blockchain verification

### Production
- Set `NODE_ENV=production`
- Use real Walrus aggregator URLs
- Configure proper `SONAR_PACKAGE_ID` from your deployed Sui contract
- Set `CORS_ORIGIN` to your production frontend URL
- Enable `SENTRY_DSN` for error tracking

## Troubleshooting

### Database Connection Issues
```bash
# Test database connection
railway run bunx prisma db pull
```

### Prisma Client Not Generated
```bash
# Manually generate Prisma client
railway run bunx prisma generate
```

### Port Binding Issues
- Railway automatically assigns the `PORT` variable
- The backend binds to `0.0.0.0:3001` by default
- Railway will proxy external traffic correctly

### Migration Failures
```bash
# Check migration status
railway run bunx prisma migrate status

# If deployment failed before the baseline migration ran, mark it as applied
railway run bunx prisma migrate resolve --applied 20241001_initial_schema

# Re-run migrations after resolving the failed one
railway run bunx prisma migrate deploy

# Reset database (WARNING: deletes all data)
railway run bunx prisma migrate reset --force
```

If a deployment failed with `P3018`/`P3009` complaining that `DatasetBlob` (or other tables) do not exist, apply the resolve command above once. This records the baseline schema migration as applied, allowing `prisma migrate deploy` to continue running future migrations normally without data loss. Use `railway run bunx prisma migrate status` to confirm all migrations are up to date afterward.

## Monitoring

### Railway Metrics
- CPU/Memory usage: Railway dashboard
- Request logs: `railway logs --tail`

### Health Endpoint
Monitor `/health` for:
- Database connectivity
- Service uptime
- Walrus availability (mocked in current implementation)

## Updating the Deployment

### Via GitHub (Recommended)
1. Push changes to `main` branch
2. Railway auto-deploys on git push

### Via CLI
```bash
cd backend
railway up
```

## Production Checklist

- [ ] PostgreSQL database provisioned
- [ ] All environment variables configured
- [ ] `JWT_SECRET` is a secure random string
- [ ] `SONAR_PACKAGE_ID` points to deployed Sui contract
- [ ] `CORS_ORIGIN` includes production frontend URL
- [ ] Database migrations successful
- [ ] Health check returns `200 OK`
- [ ] Frontend can connect to backend
- [ ] Rate limiting configured (100 req/min default)

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   (Vercel)      │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐       ┌──────────────┐
│   Backend API   │──────▶│  PostgreSQL  │
│   (Railway)     │       │  (Railway)   │
└────────┬────────┘       └──────────────┘
         │
         ├──▶ Sui Blockchain (testnet)
         ├──▶ Walrus Storage (testnet)
         └──▶ Seal Keyservers (Railway)
```

## Cost Estimation (Railway)

- **Backend Service**: ~$5-10/month (Hobby plan)
- **PostgreSQL**: ~$5/month (included in Hobby)
- **Total**: ~$10/month for testing, scales with usage

## Support

- Railway Docs: https://docs.railway.app
- Prisma Docs: https://www.prisma.io/docs
- Bun Docs: https://bun.sh/docs
