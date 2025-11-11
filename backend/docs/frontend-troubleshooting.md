# Frontend Troubleshooting Guide

## Overview

This guide covers common connection issues, retry behavior, and debugging steps for the SONAR frontend application when interacting with Sui blockchain infrastructure.

## Table of Contents

1. [GraphQL Connection Issues](#graphql-connection-issues)
2. [RPC Fallback Behavior](#rpc-fallback-behavior)
3. [Retry Logic and Expected Delays](#retry-logic-and-expected-delays)
4. [User-Facing Notifications](#user-facing-notifications)
5. [Debugging Connection Problems](#debugging-connection-problems)
6. [Configuration Requirements](#configuration-requirements)
7. [Verifying Active Endpoints](#verifying-active-endpoints)

---

## GraphQL Connection Issues

### Common GraphQL Failures

The frontend uses Sui's GraphQL endpoint for list queries and pagination. Common failure scenarios include:

#### 1. SSL/TLS Handshake Failures
**Symptoms:**
- Browser console shows `net::ERR_SSL_PROTOCOL_ERROR`
- Network tab shows failed requests to GraphQL endpoint
- User sees "Connection slow, retrying..." toast

**Causes:**
- Incorrect GraphQL domain (`.net` vs `.com`)
- Network firewall blocking GraphQL port
- SSL certificate issues on Mysten Labs infrastructure

**Solutions:**
1. Verify GraphQL URL is using `.com` domain:
   ```bash
   # Correct URL for testnet
   https://sui-testnet.mystenlabs.com/graphql

   # Incorrect (old) URL
   https://sui-testnet.mystenlabs.net/graphql
   ```

2. Check environment configuration in `.env`:
   ```bash
   NEXT_PUBLIC_GRAPHQL_URL=https://sui-testnet.mystenlabs.com/graphql
   ```

3. Test GraphQL endpoint directly:
   ```bash
   curl -I https://sui-testnet.mystenlabs.com/graphql
   ```

#### 2. Rate Limiting
**Symptoms:**
- Intermittent 429 responses
- Slow responses during high traffic

**Solutions:**
- System automatically retries with exponential backoff
- Falls back to RPC if GraphQL consistently fails
- No user action required

#### 3. GraphQL Service Outages
**Symptoms:**
- All GraphQL requests fail
- Automatic fallback to RPC occurs

**Solutions:**
- System automatically switches to RPC fallback
- User sees "Using backup connection" toast
- Pagination may be unavailable during RPC fallback

---

## RPC Fallback Behavior

### Automatic Fallback Strategy

When GraphQL fails, the system automatically falls back to RPC queries:

```typescript
// Automatic fallback flow
try {
  return await retryWithBackoff(() => getDatasetsViaGraphQL(filter), 3, 1000, true);
} catch (graphqlError) {
  // GraphQL failed after 3 retries
  logger.fallback('GraphQL', 'RPC', graphqlError.message);
  toastInfo('Using backup connection', 'Switched to RPC for reliability');

  // Fallback to RPC with retry
  return await retryWithBackoff(() => getDatasetsViaRPC(filter), 3, 1000, true);
}
```

### Fallback Characteristics

| Feature | GraphQL | RPC Fallback |
|---------|---------|--------------|
| **List Queries** | ✅ Supported | ✅ Supported |
| **Pagination** | ✅ Cursor-based | ❌ Not available |
| **Single Object Reads** | ✅ Supported | ✅ Supported (preferred) |
| **Performance** | Fast for lists | Slower for large datasets |
| **Reliability** | Lower (more failure points) | Higher (direct node access) |

### When Fallback Occurs

1. **GraphQL Connection Timeout**: After 3 retry attempts (max ~7 seconds)
2. **GraphQL Returns Errors**: Invalid responses, server errors
3. **GraphQL Unavailable**: Service outage or maintenance

### Limitations During RPC Fallback

**No Pagination Support:**
```typescript
// This will fail if GraphQL is unavailable
async getDatasetsPaginated(filter?: DatasetFilter, cursor?: string) {
  // RPC queryObjects() returns all results without cursor support
  // Pagination only works with GraphQL
  return this.getDatasetsPaginatedViaGraphQL(filter, cursor);
}
```

**Workaround:** Implement client-side pagination when RPC fallback is active.

---

## Retry Logic and Expected Delays

### Exponential Backoff Algorithm

The system uses exponential backoff with the following parameters:

```typescript
retryWithBackoff(
  fn: () => Promise<T>,
  maxRetries = 3,      // Total attempts: initial + 3 retries
  baseDelay = 1000,    // 1 second base delay
  showUserFeedback = false
)
```

### Retry Timeline

| Attempt | Delay Before Retry | Cumulative Time | User Notification |
|---------|-------------------|-----------------|-------------------|
| 1 (initial) | 0ms | 0ms | - |
| 2 | 1000ms (1s) | ~1s | "Connection slow, retrying..." |
| 3 | 2000ms (2s) | ~3s | - |
| 4 (final) | 4000ms (4s) | ~7s | - |

**Maximum Wait Time:** ~7 seconds before fallback triggers

### Retry Decision Logic

```typescript
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await fn();  // Success - return immediately
  } catch (error) {
    if (attempt < maxRetries - 1) {
      const delay = baseDelay * Math.pow(2, attempt);  // 1s, 2s, 4s

      // Show user feedback after first retry
      if (showUserFeedback && attempt === 0) {
        toastInfo('Connection slow, retrying...', 'Attempting to reconnect');
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
// All retries exhausted - throw error or fallback
```

---

## User-Facing Notifications

### Toast Notification Types

The system uses the Sonner library to display connection status:

#### 1. Slow Connection Warning
**When:** After first retry attempt (1 second delay)
```typescript
toastInfo('Connection slow, retrying...', 'Attempting to reconnect');
```

**User Action:** None required - system is handling automatically

#### 2. Fallback Notification
**When:** GraphQL fails and RPC fallback activates
```typescript
toastInfo('Using backup connection', 'Switched to RPC for reliability');
```

**User Action:** None required - functionality continues with RPC

#### 3. Error Notifications
**When:** Both GraphQL and RPC fail
```typescript
toastError('Failed to load data', error.message);
```

**User Action:** Check network connection, refresh page

### Toast Configuration

Located in `/frontend/lib/toast.ts`:
```typescript
import { toast } from 'sonner';

export const toastInfo = (title: string, description?: string) => {
  toast.info(title, { description });
};

export const toastError = (title: string, description?: string) => {
  toast.error(title, { description });
};
```

---

## Debugging Connection Problems

### 1. Check Browser Console

Open DevTools (F12) and look for structured logs:

```
[2025-11-04T10:30:15.234Z] [WARN] Retry 1/3 (1000ms delay)
{
  "attempt": 1,
  "maxRetries": 3,
  "delayMs": 1000,
  "reason": "Network request failed"
}

[2025-11-04T10:30:18.567Z] [WARN] Fallback: GraphQL → RPC
{
  "from": "GraphQL",
  "to": "RPC",
  "reason": "fetch failed"
}
```

### 2. Verify Environment Variables

Check `.env` file contains correct values:

```bash
# Required variables
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x6e4a4e65ba20ead7cea8d6ef0ed4d5639afdfff259c6943f02cbce927b21ae89
NEXT_PUBLIC_MARKETPLACE_ID=0xaa422269e77e2197188f9c8e47ffb3faf21c0bafff1d5d04ea9613acc4994bb4
NEXT_PUBLIC_USE_BLOCKCHAIN=true

# Endpoint configuration
NEXT_PUBLIC_RPC_URL=https://fullnode.testnet.sui.io
NEXT_PUBLIC_GRAPHQL_URL=https://sui-testnet.mystenlabs.com/graphql
```

### 3. Test Endpoints Manually

#### Test RPC Endpoint:
```bash
curl -X POST https://fullnode.testnet.sui.io \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "sui_getChainIdentifier",
    "params": []
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": "4c78adac",
  "id": 1
}
```

#### Test GraphQL Endpoint:
```bash
curl -X POST https://sui-testnet.mystenlabs.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ chainIdentifier }"
  }'
```

Expected response:
```json
{
  "data": {
    "chainIdentifier": "4c78adac"
  }
}
```

### 4. Check Network Tab

1. Open DevTools → Network tab
2. Filter by "graphql" or "sui"
3. Look for failed requests (red status)
4. Inspect response headers and timing

**Key Metrics:**
- **Connection time** should be < 500ms
- **SSL handshake** should succeed
- **Status codes** should be 200 or 4xx (not network errors)

### 5. Enable Debug Logging

Set environment to development mode:

```bash
NODE_ENV=development
```

This enables debug logs in `logger.ts`:
```typescript
logger.debug('GraphQL query executed', {
  query: GET_DATASETS,
  variables: { type: DATASET_TYPE },
  responseTime: 234
});
```

---

## Configuration Requirements

### Minimum Required Configuration

```bash
# .env (frontend)
NEXT_PUBLIC_NETWORK=testnet                           # Required
NEXT_PUBLIC_USE_BLOCKCHAIN=true                       # Required for blockchain mode
NEXT_PUBLIC_PACKAGE_ID=0x6e4a4e65ba...                # Required
NEXT_PUBLIC_MARKETPLACE_ID=0xaa422269e77e...          # Required

# Optional (uses defaults if not set)
NEXT_PUBLIC_RPC_URL=https://fullnode.testnet.sui.io
NEXT_PUBLIC_GRAPHQL_URL=https://sui-testnet.mystenlabs.com/graphql
```

### Default URL Construction

If `NEXT_PUBLIC_GRAPHQL_URL` is not set, the system constructs it from network:

```typescript
// lib/sui/client.ts
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'testnet';
const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL
  || `https://sui-${NETWORK}.mystenlabs.com/graphql`;
```

**Important:** Always use `.com` domain, not `.net`

### Network-Specific URLs

| Network | RPC URL | GraphQL URL |
|---------|---------|-------------|
| **testnet** | `https://fullnode.testnet.sui.io` | `https://sui-testnet.mystenlabs.com/graphql` |
| **mainnet** | `https://fullnode.mainnet.sui.io` | `https://sui-mainnet.mystenlabs.com/graphql` |
| **devnet** | `https://fullnode.devnet.sui.io` | `https://sui-devnet.mystenlabs.com/graphql` |

---

## Verifying Active Endpoints

### 1. Check Active Repository Implementation

Locate the active repository in `/frontend/lib/data/repository-provider.ts`:

```typescript
// Production: SuiRepository with real blockchain data
export const repository = new SuiRepository();
```

### 2. Monitor Network Requests

Use browser DevTools to verify which endpoint is being used:

**GraphQL Active:**
```
Request URL: https://sui-testnet.mystenlabs.com/graphql
Method: POST
Status: 200 OK
```

**RPC Fallback Active:**
```
Request URL: https://fullnode.testnet.sui.io
Method: POST
Status: 200 OK
Request Payload: {"jsonrpc":"2.0","method":"sui_queryObjects",...}
```

### 3. Check Console Logs

Look for fallback logs:
```
[WARN] Fallback: GraphQL → RPC
```

If present, RPC is being used. If absent, GraphQL is working correctly.

### 4. Verify Response Data

GraphQL responses include `pageInfo`:
```json
{
  "objects": {
    "nodes": [...],
    "pageInfo": {
      "hasNextPage": true,
      "endCursor": "ABC123"
    }
  }
}
```

RPC responses are raw Move objects:
```json
{
  "data": [
    {
      "objectId": "0x...",
      "content": {
        "dataType": "moveObject",
        "fields": {...}
      }
    }
  ]
}
```

---

## Common Error Messages and Solutions

### Error: "Failed to fetch datasets"

**Possible Causes:**
1. Both GraphQL and RPC failed after retries
2. Network connection lost
3. Invalid package ID or marketplace ID

**Solutions:**
1. Check internet connection
2. Verify environment variables are correct
3. Check browser console for detailed error logs
4. Test endpoints manually (see Debugging section)

### Error: "Pagination not available"

**Cause:** RPC fallback is active (GraphQL failed)

**Solution:**
- Wait for GraphQL to recover
- Use non-paginated list queries
- Implement client-side pagination

### Error: "Dataset not found: 0x..."

**Possible Causes:**
1. Object was deleted or transferred
2. Wrong network configuration
3. Invalid object ID

**Solutions:**
1. Verify object exists on blockchain:
   ```bash
   sui client object 0x... --network testnet
   ```
2. Check `NEXT_PUBLIC_NETWORK` matches deployment network
3. Verify object ID format is correct

### Error: "Protocol stats not found"

**Cause:** `NEXT_PUBLIC_STATS_OBJECT_ID` is incorrect or object doesn't exist

**Solutions:**
1. Check deployment documentation for correct stats object ID
2. Verify object exists on blockchain
3. Redeploy contracts if object was deleted

---

## Performance Optimization Tips

### 1. Use RPC for Single Object Reads

The system already does this automatically:
```typescript
async getDataset(id: string): Promise<Dataset> {
  // Always use RPC for critical single-object reads (more reliable)
  const obj = await suiClient.getObject({...});
}
```

### 2. Enable Response Caching

For frequently accessed data, consider adding SWR or React Query:
```typescript
// Example with SWR
import useSWR from 'swr';

const { data, error } = useSWR('/api/datasets', fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 60000, // 1 minute
});
```

### 3. Batch Requests When Possible

Instead of multiple single requests, use batch queries:
```typescript
// Multiple getDataset calls → single queryObjects call
const datasets = await repository.getDatasets({
  ids: ['0x1', '0x2', '0x3']
});
```

---

## Testing Connection Resilience

### Simulate GraphQL Failure

1. Temporarily set incorrect GraphQL URL:
   ```bash
   NEXT_PUBLIC_GRAPHQL_URL=https://invalid-url.example.com
   ```

2. Expected behavior:
   - First retry at 1s → user sees "Connection slow" toast
   - After 3 retries (~7s) → fallback to RPC
   - User sees "Using backup connection" toast
   - Data loads successfully via RPC

### Simulate Total Network Failure

1. Disconnect internet or set both URLs to invalid endpoints
2. Expected behavior:
   - Retry attempts with increasing delays
   - After all retries fail → error toast
   - User-friendly error message displayed

---

## Support and Escalation

### When to Escalate

Contact the development team if:

1. **GraphQL consistently fails** for > 1 hour
2. **Both GraphQL and RPC fail** simultaneously
3. **Data inconsistencies** between GraphQL and RPC responses
4. **Performance degradation** (> 10s load times)

### Information to Include

When reporting issues, include:

1. **Browser console logs** (especially structured logs)
2. **Network tab screenshots** showing failed requests
3. **Environment configuration** (sanitize sensitive values)
4. **Steps to reproduce** the issue
5. **Expected vs actual behavior**

### Known Issues

- **GraphQL Pagination**: RPC fallback doesn't support cursor-based pagination
- **Real-time Updates**: Neither GraphQL nor RPC provide real-time event streaming (use Sui event subscriptions for real-time data)
- **Rate Limiting**: Testnet GraphQL may rate limit during high usage

---

## Additional Resources

- [Sui GraphQL Documentation](https://docs.sui.io/references/sui-graphql)
- [Sui RPC API Reference](https://docs.sui.io/references/sui-api)
- [SONAR Backend Configuration Guide](/docs/backend-configuration.md)
- [Smart Contract Deployment Guide](/DEPLOYMENT_SUMMARY.md)
