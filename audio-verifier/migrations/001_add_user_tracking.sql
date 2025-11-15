-- Migration: Add User Tracking and Leaderboard System
-- Description: Adds tables for users, submissions, leaderboard snapshots, and airdrop eligibility
-- Created: 2025-11-15

-- ============================================================================
-- 1. ALTER verification_sessions to add user tracking and points fields
-- ============================================================================

ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(66),
ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS subject_rarity_tier VARCHAR(20),
ADD COLUMN IF NOT EXISTS subject_rarity_multiplier DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS dynamic_saturation_threshold INTEGER,
ADD COLUMN IF NOT EXISTS total_subject_samples INTEGER,
ADD COLUMN IF NOT EXISTS bulk_contributor_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS is_first_bulk_contributor BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS audio_type_hint TEXT,
ADD COLUMN IF NOT EXISTS specificity_details TEXT,
ADD COLUMN IF NOT EXISTS context_tags TEXT[],
ADD COLUMN IF NOT EXISTS recording_location TEXT,
ADD COLUMN IF NOT EXISTS equipment_used TEXT,
ADD COLUMN IF NOT EXISTS date_era TEXT,
ADD COLUMN IF NOT EXISTS user_rarity_claim TEXT,
ADD COLUMN IF NOT EXISTS rarity_score INTEGER,
ADD COLUMN IF NOT EXISTS similar_count INTEGER,
ADD COLUMN IF NOT EXISTS saturation_penalty_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS saturation_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS discovered_pattern TEXT,
ADD COLUMN IF NOT EXISTS market_gap_score INTEGER,
ADD COLUMN IF NOT EXISTS specificity_grade VARCHAR(2),
ADD COLUMN IF NOT EXISTS verified_claims TEXT[],
ADD COLUMN IF NOT EXISTS web_research_summary TEXT,
ADD COLUMN IF NOT EXISTS quality_multiplier DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS total_multiplier DECIMAL(5,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS points_awarded BIGINT DEFAULT 0;

-- Create index for wallet_address lookups
CREATE INDEX IF NOT EXISTS idx_verification_sessions_wallet
ON verification_sessions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_subject
ON verification_sessions(subject);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_rarity_score
ON verification_sessions(rarity_score DESC);

-- ============================================================================
-- 2. Create users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(66) PRIMARY KEY,
    username VARCHAR(100),
    total_points BIGINT DEFAULT 0,
    total_submissions INTEGER DEFAULT 0,
    average_rarity_score DECIMAL(5,2),
    tier VARCHAR(20) DEFAULT 'Contributor',
    rank INTEGER,
    first_bulk_contributions INTEGER DEFAULT 0,
    rare_subject_contributions INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_points
ON users(total_points DESC);

CREATE INDEX IF NOT EXISTS idx_users_rank
ON users(rank);

CREATE INDEX IF NOT EXISTS idx_users_tier
ON users(tier);

-- ============================================================================
-- 3. Create user_submissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(66) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    verification_session_id UUID NOT NULL REFERENCES verification_sessions(id) ON DELETE CASCADE,
    points_earned BIGINT NOT NULL,
    rarity_score INTEGER NOT NULL,
    subject TEXT,
    sample_count INTEGER DEFAULT 1,
    subject_rarity_tier VARCHAR(20),
    bulk_contributor_status VARCHAR(20),
    is_first_bulk_contributor BOOLEAN DEFAULT FALSE,
    quality_multiplier DECIMAL(3,2),
    bulk_bonus_multiplier DECIMAL(3,2),
    subject_rarity_multiplier DECIMAL(3,2),
    specificity_multiplier DECIMAL(3,2),
    verification_multiplier DECIMAL(3,2),
    early_contributor_multiplier DECIMAL(3,2),
    total_multiplier DECIMAL(5,2),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(verification_session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_submissions_wallet
ON user_submissions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_user_submissions_points
ON user_submissions(points_earned DESC);

CREATE INDEX IF NOT EXISTS idx_user_submissions_date
ON user_submissions(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_submissions_subject
ON user_submissions(subject);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_address, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_date
ON leaderboard_snapshot(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_rank
ON leaderboard_snapshot(snapshot_date, rank);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshot_wallet
ON leaderboard_snapshot(wallet_address);

-- ============================================================================
-- 5. Create airdrop_eligibility table
-- ============================================================================

CREATE TABLE IF NOT EXISTS airdrop_eligibility (
    wallet_address VARCHAR(66) PRIMARY KEY REFERENCES users(wallet_address) ON DELETE CASCADE,
    total_points BIGINT NOT NULL,
    tier VARCHAR(20) NOT NULL,
    submissions_count INTEGER NOT NULL,
    first_bulk_count INTEGER DEFAULT 0,
    rare_subjects_count INTEGER DEFAULT 0,
    subject_diversity INTEGER DEFAULT 0,
    consistency_score DECIMAL(5,2) DEFAULT 0,
    eligibility_score DECIMAL(10,2) NOT NULL,
    allocation_percentage DECIMAL(5,4) DEFAULT 0,
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airdrop_eligibility_score
ON airdrop_eligibility(eligibility_score DESC);

CREATE INDEX IF NOT EXISTS idx_airdrop_eligibility_allocation
ON airdrop_eligibility(allocation_percentage DESC);

-- ============================================================================
-- 6. Create subject_rarity_cache table
-- ============================================================================

CREATE TABLE IF NOT EXISTS subject_rarity_cache (
    subject TEXT PRIMARY KEY,
    rarity_tier VARCHAR(20) NOT NULL,
    rarity_multiplier DECIMAL(3,2) NOT NULL,
    dynamic_threshold INTEGER NOT NULL,
    web_research_summary TEXT,
    researched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_samples INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 7. Create user_achievements table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(66) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    achievement_key VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_description TEXT,
    badge_icon TEXT,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_address, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_wallet
ON user_achievements(wallet_address);

CREATE INDEX IF NOT EXISTS idx_user_achievements_key
ON user_achievements(achievement_key);

-- ============================================================================
-- 8. Create anti_abuse_flags table
-- ============================================================================

CREATE TABLE IF NOT EXISTS anti_abuse_flags (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(66),
    flag_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    details JSONB,
    flagged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_anti_abuse_wallet
ON anti_abuse_flags(wallet_address);

CREATE INDEX IF NOT EXISTS idx_anti_abuse_resolved
ON anti_abuse_flags(resolved);

-- ============================================================================
-- End Migration
-- ============================================================================
