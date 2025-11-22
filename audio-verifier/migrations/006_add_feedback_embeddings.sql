-- Migration: Add Feedback Embeddings and Clustering Support
-- Description: Adds embedding column to verification_feedback for semantic search and clustering
-- Created: 2025-11-22

-- ============================================================================
-- 1. Add embedding column to verification_feedback table
-- ============================================================================

ALTER TABLE verification_feedback
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ============================================================================
-- 2. Add sync tracking for Pinecone/Qdrant
-- ============================================================================

ALTER TABLE verification_feedback
ADD COLUMN IF NOT EXISTS qdrant_synced BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 3. Create HNSW index for fast similarity search
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_embedding_hnsw
ON verification_feedback USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. Create index for finding unsynced feedback
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_unsynced
ON verification_feedback(qdrant_synced)
WHERE qdrant_synced = FALSE;

-- ============================================================================
-- 5. Create index for faster theme queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_vote_created
ON verification_feedback(vote, created_at DESC);

-- ============================================================================
-- End Migration
-- ============================================================================
