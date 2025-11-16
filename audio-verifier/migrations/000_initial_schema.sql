-- Migration: Initial Schema Setup
-- Description: Creates the base verification_sessions table and enables pgvector extension
-- Created: 2025-11-16

-- ============================================================================
-- 1. Enable pgvector extension for embeddings support
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. Create base verification_sessions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_sessions (
    id UUID PRIMARY KEY,
    verification_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    stage VARCHAR(50) NOT NULL DEFAULT 'queued',
    progress FLOAT NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    initial_data JSONB,
    results JSONB,
    error TEXT,
    embedding vector(1536)
);

-- ============================================================================
-- 3. Create base indexes for verification_sessions
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_verification_id
ON verification_sessions(verification_id);

CREATE INDEX IF NOT EXISTS idx_sessions_status
ON verification_sessions(status);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at
ON verification_sessions(created_at DESC);

-- Create pgvector index for embedding similarity search
CREATE INDEX IF NOT EXISTS idx_sessions_embedding
ON verification_sessions USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- End Migration
-- ============================================================================
