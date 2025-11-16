-- Migration: Add vector embeddings support to verification_sessions
-- Enables semantic search and Pinecone integration

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to store text embeddings
-- Dimension 1536 corresponds to text-embedding-3-small from OpenAI
ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for efficient cosine similarity search
-- Using ivfflat index type with 100 lists for good balance of speed/accuracy
CREATE INDEX IF NOT EXISTS idx_sessions_embedding
ON verification_sessions USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add column to track which vectors have been synced to Pinecone
ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS pinecone_synced BOOLEAN DEFAULT FALSE;

-- Create index for finding unsynced vectors
CREATE INDEX IF NOT EXISTS idx_sessions_pinecone_synced
ON verification_sessions(pinecone_synced)
WHERE pinecone_synced = FALSE;
