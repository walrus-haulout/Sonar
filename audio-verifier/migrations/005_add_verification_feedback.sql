-- Migration: Add Verification Feedback System
-- Description: Adds table for user voting/feedback on verification results
-- Created: 2025-11-22

-- ============================================================================
-- 1. Create verification_feedback table
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
    wallet_address VARCHAR(66) NOT NULL,
    vote VARCHAR(20) NOT NULL CHECK (vote IN ('helpful', 'not_helpful')),
    feedback_text TEXT,
    feedback_category VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_session_wallet UNIQUE(session_id, wallet_address)
);

-- ============================================================================
-- 2. Create indexes for query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_session
ON verification_feedback(session_id);

CREATE INDEX IF NOT EXISTS idx_feedback_wallet
ON verification_feedback(wallet_address);

CREATE INDEX IF NOT EXISTS idx_feedback_vote
ON verification_feedback(vote);

CREATE INDEX IF NOT EXISTS idx_feedback_created
ON verification_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_session_wallet
ON verification_feedback(session_id, wallet_address);

-- ============================================================================
-- End Migration
-- ============================================================================
