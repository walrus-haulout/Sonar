# Points System Deployment Guide

This guide covers deploying the end-to-end points system to production.

## Overview

The points system awards users points for submitting audio datasets based on:
- **Rarity score** (0-100) from AI analysis
- **Quality score** (0-1) from verification pipeline
- **Multipliers**: quality, bulk, subject rarity, specificity, verification status, early contributor

Points are stored in PostgreSQL and accessible via the backend leaderboard API.

---

## Pre-Deployment Checklist

### 1. Database Setup

Both `backend` and `audio-verifier` must use the **same DATABASE_URL**.

```bash
# Railway automatically provides DATABASE_URL
# Verify both services have access:
echo $DATABASE_URL  # Should be same for both
```

### 2. Run Prisma Migration (Backend)

```bash
cd backend
npx prisma migrate deploy  # Applies 20251123_add_points_system migration
npx prisma generate  # Regenerates Prisma client
```

This creates:
- `users` table
- `user_submissions` table
- `user_achievements` table
- `leaderboard_snapshot` table
- `airdrop_eligibility` table
- `subject_rarity_cache` table
- `anti_abuse_flags` table
- Adds points columns to `verification_sessions`

### 3. Verify Migration Applied

```bash
# Connect to Railway Postgres
railway connect postgres

# Check tables exist
\dt

# Should see:
# users, user_submissions, verification_sessions, etc.

# Check verification_sessions has points columns
\d verification_sessions

# Should include: points_awarded, points_breakdown, quality_multiplier, etc.
```

### 4. Test Audio-Verifier Startup

The audio-verifier now runs migrations on startup automatically:

```bash
cd audio-verifier

# Ensure DATABASE_URL is set
export DATABASE_URL="postgresql://..."

# Start service (migrations run automatically)
python main.py

# Check logs for:
# "Running database migrations..."
# "✓ Completed: 001_add_user_tracking.sql"
# "All migrations completed successfully!"
```

---

## Deployment Steps

### 1. Deploy Backend (Prisma migration first)

```bash
cd backend

# Apply migration
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Deploy to Railway
git push railway main
```

### 2. Deploy Audio-Verifier

```bash
cd audio-verifier

# Deploy to Railway
# Migrations will run automatically on startup
git push railway main
```

### 3. Verify Points Flow

Submit a test audio dataset and verify:

```bash
# 1. Submit verification
curl -X POST https://your-audio-verifier.up.railway.app/verify \
  -H "Authorization: Bearer $VERIFIER_AUTH_TOKEN" \
  -F "file=@test.wav" \
  -F "metadata={\"walletAddress\":\"0x123...\",\"title\":\"Test\",\"sampleCount\":1}"

# 2. Check session completed with points
curl https://your-audio-verifier.up.railway.app/verify/{sessionId} \
  -H "Authorization: Bearer $VERIFIER_AUTH_TOKEN"

# Should see:
# "points_awarded": 850
# "points_breakdown": { "quality_multiplier": 1.3, ... }

# 3. Check leaderboard
curl https://your-backend.up.railway.app/api/leaderboard

# Should see user with points
```

---

## Architecture

### Flow Diagram

```
User Submits → Verification → Quality/AI Analysis → Points Calculation → DB Update
                  (main.py)      (pipeline.py)       (_award_points)    (users table)
                                                                              ↓
                                                                         Leaderboard API
                                                                      (leaderboard-service.ts)
```

### Data Flow

1. **Verification Completes** (verification_pipeline.py:375-390)
   - Pipeline calls `mark_completed()` to store results
   - If `approved=true`, calls `_award_points()`

2. **Points Calculation** (_award_points:1384-1582)
   - Extracts `walletAddress`, `rarityScore`, `qualityScore` from analysis
   - Calls `PointsCalculator.calculate_points()` with all multipliers
   - Returns breakdown: `{points, quality_multiplier, total_multiplier, ...}`

3. **User Update** (user_manager.py:119-240)
   - Calls `UserManager.add_points(wallet_address, points, ...)`
   - Updates `users.total_points`, `users.total_submissions`, `users.tier`
   - Creates `user_submissions` record with full breakdown

4. **Session Update** (session_store.py:503-548)
   - Stores `points_awarded` and `points_breakdown` JSON in `verification_sessions`
   - Provides audit trail for retroactive fixes

5. **Leaderboard Query** (backend/src/services/leaderboard-service.ts:17-81)
   - Backend queries `users` table sorted by `total_points DESC`
   - Returns rank, tier, submissions for frontend display

---

## Monitoring

### Key Metrics to Watch

1. **Points Awarded Per Day**
   ```sql
   SELECT DATE(submitted_at), COUNT(*), SUM(points_earned)
   FROM user_submissions
   GROUP BY DATE(submitted_at)
   ORDER BY DATE(submitted_at) DESC;
   ```

2. **Users Without Points** (should be 0 after verified submissions)
   ```sql
   SELECT COUNT(*) FROM verification_sessions
   WHERE status = 'completed'
   AND (results->>'approved')::boolean = true
   AND wallet_address IS NOT NULL
   AND (points_awarded IS NULL OR points_awarded = 0);
   ```

3. **Failed Points Calculations**
   - Check audio-verifier logs for:
     ```
     "Points calculation failed - flagging for retry"
     ```
   - Set up Sentry alerts for this error

### Logs to Monitor

**audio-verifier:**
- `"Successfully awarded X points to wallet..."`  # Success
- `"No wallet address - skipping points"`  # Expected for anonymous submissions
- `"Missing rarityScore from analysis"`  # ERROR - AI analysis failed
- `"Points calculation failed"`  # ERROR - retry needed

**backend:**
- Leaderboard API 500 errors → migration not applied
- Slow leaderboard queries → missing indexes

---

## Troubleshooting

### Leaderboard Returns 500 "relation users does not exist"

**Cause:** Prisma migration not applied

**Fix:**
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
railway restart
```

### Points Not Awarded

**Symptoms:**
- `verification_sessions.points_awarded` is 0 or NULL
- `users` table empty despite approved submissions

**Debugging:**
```bash
# Check audio-verifier logs
railway logs -s audio-verifier | grep "points"

# Common issues:
# - "No wallet address" → metadata missing walletAddress
# - "Missing rarityScore" → AI analysis didn't return rarity
# - "Points calculation failed" → database connection issue
```

**Fixes:**
1. Ensure metadata includes `walletAddress` field
2. Verify AI analysis returns `rarityScore` and `qualityScore`
3. Check DATABASE_URL is correct for both services

### Users Table Empty

**Cause:** Migration didn't run or failed silently

**Fix:**
```bash
# Manually run migrations
cd audio-verifier
python migrations/migrate.py

# Or restart service to trigger auto-migration
railway restart -s audio-verifier
```

### Points Calculation Stuck

**Symptoms:**
- Verification completes but points never appear
- No error logs

**Debugging:**
```bash
# Check if _award_points is being called
railway logs -s audio-verifier | grep "Calculating points"

# If not found, check:
# 1. Is submission approved?
SELECT status, results->>'approved' FROM verification_sessions WHERE id = '...';

# 2. Does metadata have walletAddress?
SELECT initial_data->'metadata'->>'walletAddress' FROM verification_sessions WHERE id = '...';
```

---

## Rollback Plan

If points system causes issues:

1. **Disable points calculation** (zero downtime):
   ```python
   # In verification_pipeline.py line 384, comment out:
   # if approved:
   #     await self._award_points(...)
   ```

2. **Revert migration** (if critical):
   ```bash
   cd backend
   # Create down migration
   echo "DROP TABLE IF EXISTS users CASCADE;" > prisma/migrations/down.sql
   psql $DATABASE_URL < prisma/migrations/down.sql
   ```

3. **Preserve data** (recommended):
   - Don't drop tables
   - Fix issue and retroactively award points:
   ```sql
   -- Find sessions that should have points but don't
   SELECT id, wallet_address, results->>'rarityScore'
   FROM verification_sessions
   WHERE status = 'completed'
   AND (results->>'approved')::boolean = true
   AND (points_awarded IS NULL OR points_awarded = 0);
   ```

---

## Performance Considerations

### Database Indexes

All critical indexes are created by migration:
- `users(total_points DESC)` - leaderboard sorting
- `user_submissions(wallet_address)` - user history
- `user_submissions(points_earned DESC)` - top submissions
- `verification_sessions(wallet_address)` - user sessions

### Caching

- **Dataset count** cached for 5 minutes (_get_total_dataset_count)
- **Leaderboard** should be cached at API level (add Redis if needed)

### Query Performance

Leaderboard query is optimized:
```sql
-- Uses index on total_points DESC
SELECT * FROM users
ORDER BY total_points DESC
LIMIT 100;
```

For large scale (>100k users), add pagination:
```typescript
const leaderboard = await getGlobalLeaderboard(100, offset);
```

---

## Testing in Production

### 1. Canary Test

Submit one test dataset:
```bash
# Use a test wallet
WALLET="0x0000000000000000000000000000000000000000000000000000000000000001"

# Submit test audio
curl -X POST $AUDIO_VERIFIER_URL/verify \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.wav" \
  -F "metadata={\"walletAddress\":\"$WALLET\",\"title\":\"Canary Test\",\"sampleCount\":1}"
```

Verify:
- Session completes with `points_awarded > 0`
- User appears in `/api/leaderboard`
- User has correct tier (Contributor for first submission)

### 2. Load Test

After canary passes, submit 10-100 test submissions and verify:
- All points awarded correctly
- Leaderboard ranks are correct
- No performance degradation

---

## Success Criteria

✅ Prisma migration applied successfully
✅ Migrations run automatically on audio-verifier startup
✅ Test submission awards points (verified in DB and logs)
✅ `/api/leaderboard` returns users with points
✅ No 500 errors in production logs
✅ Points calculation completes in <100ms (check logs)

---

## Support

If issues arise:
1. Check Railway logs: `railway logs -s audio-verifier`
2. Check database: `railway connect postgres`
3. Verify migration: `\d users` should show table
4. Contact team with logs and session ID

---

## Next Steps

After successful deployment:
1. Monitor points distribution across users
2. Tune multipliers if needed (audio-verifier/points_calculator.py)
3. Implement leaderboard snapshots (run daily cron)
4. Calculate airdrop eligibility (run monthly)
5. Add achievement tracking (first submission, 1000 points, etc.)
