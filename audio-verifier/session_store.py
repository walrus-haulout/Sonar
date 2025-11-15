"""
PostgreSQL Session Store for Verification Sessions.

Stores verification session data in Railway Postgres (same database as backend).
Replaces Vercel KV with PostgreSQL for unified infrastructure.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import asyncpg

logger = logging.getLogger(__name__)


class SessionStore:
    """
    PostgreSQL-based session storage for verification sessions.
    
    Uses asyncpg for async database operations. Stores sessions in the same
    Railway Postgres database used by the backend.
    """

    def __init__(self):
        """Initialize session store with PostgreSQL connection."""
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL must be set for session storage")

        self.database_url = database_url
        self._pool: Optional[asyncpg.Pool] = None
        logger.info("Initialized PostgreSQL session store")

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=1,
                max_size=10,
                command_timeout=60
            )
            # Create table schema on first connection
            await self._ensure_schema()
        return self._pool

    async def _ensure_schema(self):
        """Create sessions table if it doesn't exist."""
        if self._pool is None:
            return
        
        async with self._pool.acquire() as conn:
            await conn.execute("""
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
                    error TEXT
                );
            """)
            
            # Create indexes if they don't exist
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_verification_id 
                ON verification_sessions(verification_id);
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_status 
                ON verification_sessions(status);
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_created_at 
                ON verification_sessions(created_at);
            """)
            
            logger.info("Verified verification_sessions table schema")

    async def create_session(
        self,
        verification_id: str,
        initial_data: Dict[str, Any]
    ) -> str:
        """
        Create a new verification session in PostgreSQL.
        
        Args:
            verification_id: Unique verification identifier
            initial_data: Initial session data containing:
                - plaintext_cid or encrypted_cid: Walrus blob ID
                - plaintext_size_bytes: Size in bytes
                - duration_seconds: Audio duration
                - file_format: Audio format (e.g., "audio/wav")
        
        Returns:
            Session ID (UUID)
        """
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO verification_sessions 
                    (id, verification_id, status, stage, progress, created_at, updated_at, initial_data)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                    session_id,
                    verification_id,
                    "processing",
                    "queued",
                    0.0,
                    now,
                    now,
                    json.dumps(initial_data)
                )
            
            logger.info(f"Created session {session_id[:8]}... in PostgreSQL")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create session in PostgreSQL: {e}", exc_info=True)
            raise RuntimeError(f"Failed to create session: {str(e)}")

    async def update_session(
        self,
        session_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """
        Update verification session data in PostgreSQL.
        
        Args:
            session_id: Session ID
            updates: Dictionary with updates:
                - stage: Stage name (str)
                - progress: Progress percentage (0.0-1.0)
                - status: Optional status update
                - results: Optional results data
                - error: Optional error message
        
        Returns:
            True if successful, False otherwise
        """
        try:
            pool = await self._get_pool()
            
            # Build UPDATE query dynamically based on provided updates
            update_fields = []
            update_values = []
            param_num = 1
            
            if "stage" in updates:
                update_fields.append(f"stage = ${param_num}")
                update_values.append(str(updates["stage"]))
                param_num += 1
            
            if "progress" in updates:
                update_fields.append(f"progress = ${param_num}")
                update_values.append(float(updates["progress"]))
                param_num += 1
            
            if "status" in updates:
                update_fields.append(f"status = ${param_num}")
                update_values.append(str(updates["status"]))
                param_num += 1
            
            if "results" in updates:
                update_fields.append(f"results = ${param_num}")
                update_values.append(json.dumps(updates["results"]))
                param_num += 1
            
            if "error" in updates:
                error_value = updates["error"]
                if isinstance(error_value, list):
                    error_value = ", ".join(str(e) for e in error_value)
                update_fields.append(f"error = ${param_num}")
                update_values.append(str(error_value))
                param_num += 1
            
            # Always update updated_at
            update_fields.append(f"updated_at = ${param_num}")
            update_values.append(datetime.now(timezone.utc))
            param_num += 1
            
            # Add session_id as last parameter
            update_values.append(session_id)
            
            if not update_fields:
                logger.warning(f"No fields to update for session {session_id[:8]}...")
                return False
            
            query = f"""
                UPDATE verification_sessions 
                SET {', '.join(update_fields)}
                WHERE id = ${param_num}
            """
            
            async with pool.acquire() as conn:
                result = await conn.execute(query, *update_values)
                
                # Check if any rows were updated
                if "0" in result:  # asyncpg returns "UPDATE 0" if no rows affected
                    logger.warning(f"Session {session_id[:8]}... not found for update")
                    return False
            
            logger.debug(f"Updated session {session_id[:8]}... stage={updates.get('stage')} progress={updates.get('progress')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update session in PostgreSQL: {e}", exc_info=True)
            return False

    async def mark_completed(
        self,
        session_id: str,
        result_data: Dict[str, Any]
    ) -> bool:
        """
        Mark verification as completed in PostgreSQL.
        
        Args:
            session_id: Session ID
            result_data: Final verification results containing:
                - approved: bool
                - quality: dict with score
                - copyright: dict
                - transcript: string
                - transcriptPreview: string
                - analysis: dict
                - safetyPassed: bool
        
        Returns:
            True if successful, False otherwise
        """
        try:
            updates = {
                "status": "completed",
                "stage": "completed",
                "progress": 1.0,
                "results": result_data
            }
            return await self.update_session(session_id, updates)
            
        except Exception as e:
            logger.error(f"Failed to mark session completed: {e}", exc_info=True)
            return False

    async def mark_failed(
        self,
        session_id: str,
        error_data: Dict[str, Any]
    ) -> bool:
        """
        Mark verification as failed in PostgreSQL.
        
        Args:
            session_id: Session ID
            error_data: Error information containing:
                - errors: List of error messages
                - stage_failed: Stage where failure occurred
                - cancelled: Optional bool if cancelled
        
        Returns:
            True if successful, False otherwise
        """
        try:
            status = "cancelled" if error_data.get("cancelled") else "failed"
            error_value = error_data.get("errors", [error_data.get("stage_failed", "unknown")])
            
            updates = {
                "status": status,
                "stage": "failed",
                "progress": 0.0,
                "error": error_value
            }
            return await self.update_session(session_id, updates)
            
        except Exception as e:
            logger.error(f"Failed to mark session failed: {e}", exc_info=True)
            return False

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get verification session from PostgreSQL.
        
        Args:
            session_id: Session ID
        
        Returns:
            Session data if found, None otherwise
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT id, verification_id, status, stage, progress, 
                           created_at, updated_at, initial_data, results, error
                    FROM verification_sessions
                    WHERE id = $1
                """, session_id)
                
                if not row:
                    logger.warning(f"Session {session_id[:8]}... not found in PostgreSQL")
                    return None
                
                # Convert row to dict
                session_data = {
                    "id": str(row["id"]),
                    "verification_id": row["verification_id"],
                    "status": row["status"],
                    "stage": row["stage"],
                    "progress": float(row["progress"]),
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                    "initial_data": json.loads(row["initial_data"]) if row["initial_data"] else None,
                    "results": json.loads(row["results"]) if row["results"] else None,
                    "error": row["error"]
                }
                
                logger.debug(f"Retrieved session {session_id[:8]}... from PostgreSQL")
                return session_data
                
        except Exception as e:
            logger.error(f"Error retrieving session: {e}", exc_info=True)
            return None

    async def update_stage(
        self,
        session_id: str,
        stage_name: str,
        progress: float
    ) -> bool:
        """
        Update verification stage and progress.
        
        Convenience method that wraps update_session.
        
        Args:
            session_id: Session ID
            stage_name: Stage name (e.g., "quality", "copyright", "transcription")
            progress: Progress percentage (0.0-1.0)
        
        Returns:
            True if successful, False otherwise
        """
        return await self.update_session(session_id, {
            "stage": stage_name,
            "progress": progress
        })

    async def close(self):
        """Close database connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Closed PostgreSQL connection pool")
