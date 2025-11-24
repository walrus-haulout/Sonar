-- Migration: Add Points System and Leaderboard
-- Description: Adds users, user_submissions, and leaderboard tables for the points system
-- Note: verification_sessions table is managed by audio-verifier, this migration only adds points-related tables
-- Created: 2025-11-23

-- ============================================================================
-- 1. Create users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(66) PRIMARY KEY,
    username VARCHAR(100),
    total_points BIGINT DEFAULT 0 NOT NULL,
    total_submissions INTEGER DEFAULT 0 NOT NULL,
    average_rarity_score DECIMAL(5,2),
    tier VARCHAR(20) DEFAULT 'Contributor' NOT NULL,
    rank INTEGER,
    first_bulk_contributions INTEGER DEFAULT 0 NOT NULL,
    rare_subject_contributions INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_total_points ON users(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank);

-- ============================================================================
-- 2. Create user_submissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(66) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    verification_session_id UUID NOT NULL,
    points_earned BIGINT NOT NULL,
    rarity_score INTEGER NOT NULL,
    subject TEXT,
    sample_count INTEGER DEFAULT 1 NOT NULL,
    subject_rarity_tier VARCHAR(20),
    bulk_contributor_status VARCHAR(20),
    is_first_bulk_contributor BOOLEAN DEFAULT false NOT NULL,
    quality_multiplier DECIMAL(3,2),
    bulk_bonus_multiplier DECIMAL(3,2),
    subject_rarity_multiplier DECIMAL(3,2),
    specificity_multiplier DECIMAL(3,2),
    verification_multiplier DECIMAL(3,2),
    early_contributor_multiplier DECIMAL(3,2),
    total_multiplier DECIMAL(5,2),
    submitted_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(verification_session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_submissions_wallet_address ON user_submissions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_submissions_points_earned ON user_submissions(points_earned DESC);
CREATE INDEX IF NOT EXISTS idx_user_submissions_submitted_at ON user_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_submissions_subject ON user_submissions(subject);

-- ============================================================================
-- 3. Create user_achievements table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(66) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    achievement_key VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_description TEXT,
    badge_icon TEXT,
    unlocked_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(wallet_address, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_wallet_address ON user_achievements(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_key ON user_achievements(achievement_key);

-- ============================================================================
-- 4. Create leaderboard_snapshot table
-- ============================================================================

CREATE TABLE IF NOT EXISTS leaderboard_snapshot (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(66) NOT NULL,
    rank INTEGER NOT NULL,
    total_points BIGINT NOT NULL,
    tier VARCHAR(20) NOT NULL,
    total_submissions INTEGER,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(wallet_address, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_snapshot_date ON leaderboard_snapshot(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_snapshot_date_rank ON leaderboard_snapshot(snapshot_date, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_wallet_address ON leaderboard_snapshot(wallet_address);

-- ============================================================================
-- 5. Create airdrop_eligibility table
-- ============================================================================

CREATE TABLE IF NOT EXISTS airdrop_eligibility (
    wallet_address VARCHAR(66) PRIMARY KEY REFERENCES users(wallet_address) ON DELETE CASCADE,
    total_points BIGINT NOT NULL,
    tier VARCHAR(20) NOT NULL,
    submissions_count INTEGER NOT NULL,
    first_bulk_count INTEGER DEFAULT 0 NOT NULL,
    rare_subjects_count INTEGER DEFAULT 0 NOT NULL,
    subject_diversity INTEGER DEFAULT 0 NOT NULL,
    consistency_score DECIMAL(5,2) DEFAULT 0 NOT NULL,
    eligibility_score DECIMAL(10,2) NOT NULL,
    allocation_percentage DECIMAL(5,4) DEFAULT 0 NOT NULL,
    last_calculated TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_airdrop_eligibility_eligibility_score ON airdrop_eligibility(eligibility_score DESC);
CREATE INDEX IF NOT EXISTS idx_airdrop_eligibility_allocation_percentage ON airdrop_eligibility(allocation_percentage DESC);

-- ============================================================================
-- 6. Create subject_rarity_cache table
-- ============================================================================

CREATE TABLE IF NOT EXISTS subject_rarity_cache (
    subject TEXT PRIMARY KEY,
    rarity_tier VARCHAR(20) NOT NULL,
    rarity_multiplier DECIMAL(3,2) NOT NULL,
    dynamic_threshold INTEGER NOT NULL,
    web_research_summary TEXT,
    researched_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total_samples INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ============================================================================
-- 7. Create anti_abuse_flags table
-- ============================================================================

CREATE TABLE IF NOT EXISTS anti_abuse_flags (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(66),
    flag_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' NOT NULL,
    description TEXT,
    details JSONB,
    flagged_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved BOOLEAN DEFAULT false NOT NULL,
    resolved_at TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS idx_anti_abuse_flags_wallet_address ON anti_abuse_flags(wallet_address);
CREATE INDEX IF NOT EXISTS idx_anti_abuse_flags_resolved ON anti_abuse_flags(resolved);

-- ============================================================================
-- 8. Add points columns to verification_sessions (if not exist)
-- ============================================================================

-- These columns are added to the existing verification_sessions table
-- managed by audio-verifier to enable points tracking

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='wallet_address') THEN
        ALTER TABLE verification_sessions ADD COLUMN wallet_address VARCHAR(66);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='points_awarded') THEN
        ALTER TABLE verification_sessions ADD COLUMN points_awarded BIGINT DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='points_breakdown') THEN
        ALTER TABLE verification_sessions ADD COLUMN points_breakdown JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='rarity_score') THEN
        ALTER TABLE verification_sessions ADD COLUMN rarity_score INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='quality_multiplier') THEN
        ALTER TABLE verification_sessions ADD COLUMN quality_multiplier DECIMAL(3,2) DEFAULT 1.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='verification_sessions' 
                   AND column_name='total_multiplier') THEN
        ALTER TABLE verification_sessions ADD COLUMN total_multiplier DECIMAL(5,2) DEFAULT 1.0;
    END IF;
END $$;

-- Add indexes for points-related queries
CREATE INDEX IF NOT EXISTS idx_verification_sessions_wallet_address ON verification_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_verification_sessions_points_awarded ON verification_sessions(points_awarded DESC);

-- ============================================================================
-- End Migration
-- ============================================================================
