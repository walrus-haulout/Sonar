-- Migration 004: Add warnings column to store non-fatal audio processing warnings
-- Purpose: Capture and store mpg123/ffmpeg decode warnings separately from fatal errors
-- Date: 2025-11-22

-- Add warnings column to store non-fatal issues as TEXT array
-- Stores warning messages from audio processing (e.g., mpg123 decode warnings)
ALTER TABLE verification_sessions
ADD COLUMN warnings TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add index for efficient querying of sessions with warnings
-- Useful for debugging and finding sessions with quality warnings
CREATE INDEX idx_sessions_has_warnings
ON verification_sessions ((array_length(warnings, 1) > 0));

-- Verify the column was added
-- Run: SELECT id, warnings FROM verification_sessions LIMIT 5;
