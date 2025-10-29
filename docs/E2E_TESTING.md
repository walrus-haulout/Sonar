# End-to-End Testing Checklist

This document provides a comprehensive testing checklist for verifying the complete SONAR platform functionality.

## Pre-Testing Setup

### Prerequisites
- [ ] Backend deployed to Railway or running locally on `http://localhost:3001`
- [ ] Frontend running on `http://localhost:3000`
- [ ] Sui testnet wallet configured (e.g., Sui Wallet, Ethos)
- [ ] Test wallet has testnet SONAR tokens
- [ ] Database seeded with mock datasets
- [ ] All environment variables configured correctly

### Local Setup
```bash
# Terminal 1: Start backend
cd backend
bun run dev

# Terminal 2: Start frontend
cd frontend
npm run dev

# Terminal 3: Keep open for logs
cd backend
railway logs -f
```

## Phase 1: Health & Connectivity

### 1.1 Backend Health Check
- [ ] Backend responds to health check: `curl http://localhost:3001/health`
- [ ] Health response includes `"status": "ok"`
- [ ] Database connectivity shows `"database": true`
- [ ] All endpoints are accessible

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123,
  "database": true,
  "walrus": true
}
```

### 1.2 Frontend Loads
- [ ] Frontend page loads without errors
- [ ] No console errors or warnings
- [ ] Wallet connect button visible
- [ ] Navigation menu renders correctly

### 1.3 CORS Configuration
- [ ] Verify CORS headers are present: `Access-Control-Allow-Origin`
- [ ] API calls from frontend to backend succeed
- [ ] No "CORS policy" errors in browser console

## Phase 2: Wallet Integration

### 2.1 Wallet Connection
- [ ] Click "Connect Wallet" button
- [ ] Wallet selection modal appears
- [ ] Can select from available wallets
- [ ] Wallet connection succeeds
- [ ] Connected wallet address displays in UI
- [ ] Wallet icon/badge appears in navbar

**Verification:**
- Browser console shows wallet address
- Connected state persists on page refresh
- Wallet balance displays correctly

### 2.2 Wallet Disconnection
- [ ] Click wallet address in navbar
- [ ] Disconnect option appears
- [ ] Click disconnect
- [ ] Wallet disconnects cleanly
- [ ] UI returns to "Connect Wallet" state
- [ ] No lingering wallet data in localStorage

## Phase 3: Authentication Flow

### 3.1 Challenge Request
- [ ] With wallet connected, click "Authenticate"
- [ ] Request challenge endpoint is called
- [ ] Backend logs show challenge request: `Challenge requested`
- [ ] No errors in backend logs
- [ ] Frontend shows "Signing..." state

**Check in browser Network tab:**
- POST to `/auth/challenge` returns 200
- Response includes `nonce`, `message`, `expiresAt`
- Message is well-formatted

### 3.2 Message Signing
- [ ] Wallet prompts user to sign message
- [ ] Message displayed in wallet is readable
- [ ] Message includes all required fields:
  - [ ] Address
  - [ ] Nonce
  - [ ] Expiration time
  - [ ] SONAR branding
- [ ] User can review before signing

### 3.3 Signature Verification
- [ ] User signs message in wallet
- [ ] Frontend sends signature to backend
- [ ] Backend verifies signature: `User authenticated` log
- [ ] JWT token received and stored
- [ ] No errors in backend logs

**Check in browser:**
- Network tab shows POST to `/auth/verify` returns 200
- Response includes `token` (JWT) and `expiresAt`
- localStorage contains `sonar_auth_token`
- localStorage contains `sonar_auth_expiry`

### 3.4 Authentication Persistence
- [ ] Reload page
- [ ] User remains authenticated
- [ ] No new signature required
- [ ] Wallet still shows as connected

### 3.5 Token Expiration (Optional, requires waiting or mocking)
- [ ] Set token to expire in 1 minute (modify backend)
- [ ] Wait for expiration
- [ ] Attempt to access protected endpoint
- [ ] Should receive 401 Unauthorized
- [ ] Frontend should prompt for re-authentication

## Phase 4: Dataset Discovery

### 4.1 Marketplace Display
- [ ] Marketplace page loads
- [ ] At least 5 datasets visible
- [ ] Each dataset shows:
  - [ ] Title
  - [ ] Description
  - [ ] Duration
  - [ ] Quality score badge
  - [ ] Language tags
  - [ ] Price in SONAR
  - [ ] Format list
  - [ ] Purchase button

### 4.2 Dataset Waveform Preview
- [ ] Hover over dataset card's waveform area
- [ ] Waveform peaks render from actual audio
- [ ] Audio playback starts after 150-200ms delay
- [ ] Play controls work:
  - [ ] Click to pause
  - [ ] Click to resume
  - [ ] Volume control adjusts audio level

### 4.3 Dataset Search/Filter (If implemented)
- [ ] Filter by language works
- [ ] Filter by quality score works
- [ ] Filter by price range works
- [ ] Multiple filters can combine
- [ ] Clear filters button works

## Phase 5: Dataset Details Page

### 5.1 Detail Page Load
- [ ] Click dataset from marketplace
- [ ] Detail page loads with complete information
- [ ] No 404 errors
- [ ] Correct dataset displays

### 5.2 Audio Player
- [ ] Full audio player displays
- [ ] Real waveform renders from backend
- [ ] Play/pause button works
- [ ] Seeking works (click on waveform or progress bar)
- [ ] Time display shows current / total duration
- [ ] Volume control works
- [ ] Visualizations update in real-time

### 5.3 Dataset Metadata
- [ ] Title, description, creator all display
- [ ] Quality score shows with correct badge
- [ ] Language tags display
- [ ] Format list shows
- [ ] Duration displays in seconds and human-readable format
- [ ] Price displays with SONAR symbol

### 5.4 Preview Mode Indication
- [ ] If not purchased, shows "Preview Mode" message
- [ ] Message explains purchase is required
- [ ] Clear indication of Walrus + Seal encryption

## Phase 6: Purchase Flow

### 6.1 Purchase Initiation
- [ ] Click "Purchase" button on dataset detail
- [ ] Purchase confirmation modal appears
- [ ] Shows dataset title, price, breakdown
- [ ] Confirms user wallet address
- [ ] Accept / Cancel options visible

### 6.2 Purchase Transaction
- [ ] Click "Confirm Purchase"
- [ ] Wallet prompts to sign transaction
- [ ] Transaction shows correct amount and recipient
- [ ] User can review before confirming
- [ ] Transaction submitted to blockchain

### 6.3 Purchase Confirmation
- [ ] Backend receives purchase event
- [ ] Database updates purchase record
- [ ] Access log created: `action: "PURCHASE_PROCESSED"`
- [ ] Toast notification shows success
- [ ] No errors in browser console or backend logs

### 6.4 Access Grant Request (Post-Purchase)
- [ ] After successful purchase, request access grant
- [ ] Backend verifies ownership via blockchain query
- [ ] `/api/datasets/:id/access` returns 200
- [ ] Response includes:
  - [ ] `seal_policy_id`
  - [ ] `download_url`
  - [ ] `blob_id`
  - [ ] `expires_at`

## Phase 7: Protected Audio Streaming

### 7.1 Full Audio Playback (Post-Purchase)
- [ ] Audio player now shows "Full Access" instead of "Preview Mode"
- [ ] Click play on the full audio player
- [ ] Audio streams from Walrus endpoint
- [ ] Waveform renders from full audio
- [ ] Progress tracking works smoothly
- [ ] Seeking works across full audio
- [ ] No interruptions in playback

### 7.2 Authorization Header
- [ ] Check Network tab in browser DevTools
- [ ] Stream request includes `Authorization: Bearer {token}`
- [ ] Backend logs show authorized access: `Stream started for user`
- [ ] No 401 Unauthorized errors

### 7.3 Stream Quality
- [ ] Audio plays without buffering (on good connection)
- [ ] Volume control works
- [ ] All audio formats supported:
  - [ ] MP3
  - [ ] WAV (if available)
  - [ ] M4A (if available)
  - [ ] OGG (if available)

## Phase 8: Download Functionality

### 8.1 Download Button (If Implemented)
- [ ] Download button appears on detail page
- [ ] Shows estimated file size
- [ ] Shows format and bitrate
- [ ] Requires authentication

### 8.2 Download Progress
- [ ] Click download
- [ ] Toast shows "Preparing download..."
- [ ] Access grant requested
- [ ] Audio file begins streaming
- [ ] Progress bar shows:
  - [ ] Bytes downloaded / total
  - [ ] Percentage complete
  - [ ] Download speed (MB/s)
  - [ ] Estimated time remaining
- [ ] Cancel button available during download

### 8.3 Download Completion
- [ ] File downloads to user's device
- [ ] Filename is meaningful: `{dataset-id}-{title}.mp3`
- [ ] File size matches expected size
- [ ] Audio plays in local player
- [ ] No corrupted files

## Phase 9: Error Handling

### 9.1 Invalid Authentication
- [ ] Try accessing protected endpoint without token
- [ ] Should receive 401 error
- [ ] Frontend shows "Authentication required" message
- [ ] User redirected to login

### 9.2 Expired Token
- [ ] Modify token to be expired
- [ ] Try to access protected endpoint
- [ ] Should receive 401 error
- [ ] Frontend prompts re-authentication
- [ ] Clear error message displays

### 9.3 Invalid Signature
- [ ] In challenge request, try with invalid address
- [ ] Should receive 400 "Invalid address" error
- [ ] Backend logs show warning
- [ ] User sees error toast

### 9.4 Nonce Expiration
- [ ] Request challenge
- [ ] Wait 5+ minutes (or set shorter TTL for testing)
- [ ] Try to verify signature with old nonce
- [ ] Should receive 401 "Invalid or expired nonce"
- [ ] Backend logs show nonce invalid

### 9.5 Replay Attack Prevention
- [ ] Request challenge and sign message
- [ ] Verify signature successfully (get JWT)
- [ ] Try to verify same signature again
- [ ] Should receive 401 "Invalid or expired nonce"
- [ ] Nonce should be consumed, not reusable

### 9.6 Network Errors
- [ ] Simulate backend down: `railway down` or kill process
- [ ] Frontend shows "Backend unavailable" error
- [ ] Toast with helpful message displays
- [ ] No console errors
- [ ] Restart backend
- [ ] Functionality resumes

### 9.7 Database Errors
- [ ] (For testing) Disconnect database
- [ ] Health check shows `"database": false`
- [ ] API calls return 503 Service Unavailable
- [ ] Reconnect database
- [ ] Services recover automatically

## Phase 10: Performance & Load Testing

### 10.1 Page Load Times
- [ ] Marketplace page loads in < 3 seconds (first load)
- [ ] Detail page loads in < 2 seconds
- [ ] Audio waveform renders within 2 seconds

### 10.2 Audio Streaming Performance
- [ ] 30-60 second audio streams without buffering
- [ ] Seeking is responsive (< 500ms)
- [ ] CPU usage stays reasonable during playback
- [ ] Memory doesn't spike during playback

### 10.3 Concurrent Users (If possible)
- [ ] Multiple users can authenticate simultaneously
- [ ] Multiple users can stream different audio
- [ ] No race conditions observed
- [ ] Server handles gracefully

## Phase 11: Security Checks

### 11.1 Authentication Security
- [ ] JWT tokens are properly signed
- [ ] Cannot forge valid tokens
- [ ] Tokens expire correctly
- [ ] Nonces are single-use (replay attack prevention)
- [ ] Signatures are validated correctly

### 11.2 HTTPS/TLS
- [ ] In production, all traffic is HTTPS
- [ ] No mixed content warnings
- [ ] Security headers present:
  - [ ] `Strict-Transport-Security`
  - [ ] `X-Content-Type-Options`
  - [ ] `X-Frame-Options`

### 11.3 CORS Security
- [ ] CORS origin properly restricted
- [ ] Credentials sent only to trusted origins
- [ ] Preflight requests return correct headers
- [ ] Cross-origin attacks blocked

### 11.4 Secret Management
- [ ] JWT_SECRET is 32+ bytes
- [ ] JWT_SECRET not in logs
- [ ] Database URL not exposed in frontend
- [ ] API keys not in public code

## Phase 12: Data Consistency

### 12.1 Purchase Records
- [ ] Purchase appears in database after transaction
- [ ] Access log entries created for each action
- [ ] Timestamps are accurate
- [ ] No duplicate purchases recorded

### 12.2 Audio Metadata
- [ ] Dataset metadata matches blockchain
- [ ] Duration calculations accurate
- [ ] Quality scores correct
- [ ] Price conversions correct

### 12.3 User Data
- [ ] User address stored correctly
- [ ] Token expiration times accurate
- [ ] No sensitive data in logs
- [ ] Data privacy maintained

## Phase 13: Cross-Browser Compatibility

### 13.1 Chrome/Edge
- [ ] All features work
- [ ] Audio plays correctly
- [ ] No console errors

### 13.2 Firefox
- [ ] All features work
- [ ] Audio plays correctly
- [ ] No console errors

### 13.3 Safari
- [ ] Wallet connection works
- [ ] Audio format compatibility checked (WAV support)
- [ ] Responsive design works

### 13.4 Mobile Browsers
- [ ] Layout responsive on mobile
- [ ] Touch interactions work
- [ ] Audio controls accessible
- [ ] Performance acceptable on 4G

## Phase 14: Accessibility

### 14.1 Keyboard Navigation
- [ ] Tab through all buttons
- [ ] Enter activates buttons
- [ ] Focus indicators visible
- [ ] Logical tab order

### 14.2 Screen Reader Compatibility
- [ ] Audio player controls announced
- [ ] Buttons have proper labels
- [ ] Icons have alt text or aria-labels
- [ ] Form inputs properly labeled

### 14.3 Color Contrast
- [ ] Text has sufficient contrast (WCAG AA)
- [ ] Controls visible with sonar theme
- [ ] Error messages clearly visible

## Phase 15: Documentation & Support

### 15.1 User Documentation
- [ ] Help section accessible
- [ ] Wallet setup instructions clear
- [ ] Purchase process documented
- [ ] Troubleshooting guide present

### 15.2 Developer Documentation
- [ ] API docs complete (see API.md)
- [ ] Deployment instructions clear (see DEPLOYMENT.md)
- [ ] Code comments present
- [ ] README updated

### 15.3 Error Messages
- [ ] All error messages are helpful
- [ ] Messages suggest next steps
- [ ] Technical jargon minimized
- [ ] Consistent terminology used

## Testing Summary

After completing all tests:

- [ ] All tests passed
- [ ] No critical bugs found
- [ ] No security vulnerabilities identified
- [ ] Performance acceptable
- [ ] Ready for production deployment

### Sign-off

**Tested By:** ________________
**Date:** ________________
**Build Version:** ________________
**Notes:**

---

## Quick Test Scenarios

### Scenario 1: First-Time User
```
1. Load homepage
2. Connect wallet
3. Authenticate with signature
4. Browse marketplace
5. Click on dataset
6. Listen to preview
7. Purchase dataset
8. Stream full audio
9. Download (if available)
```

### Scenario 2: Returning User
```
1. Load homepage
2. Already authenticated (token valid)
3. Browse marketplace
4. Access previously purchased dataset
5. Stream full audio
6. Verify no re-authentication needed
```

### Scenario 3: Error Recovery
```
1. Disconnect backend
2. Observe error handling
3. Reconnect backend
4. Verify functionality restored
5. Resume normal flow
```

### Scenario 4: Long Session
```
1. Authenticate
2. Wait 1 hour+ (optional)
3. Try to access protected resource
4. Handle token expiration
5. Re-authenticate smoothly
```
