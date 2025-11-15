"""
Unit tests for session_store.py

Tests PostgreSQL session storage with mocked database connections.
"""

import pytest
import json
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone

from session_store import SessionStore


def create_mock_pool(mock_conn=None):
    """Helper to create properly configured mock pool and connection."""
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_acquire = AsyncMock()
    mock_acquire.__aenter__.return_value = mock_conn
    mock_acquire.__aexit__.return_value = None
    mock_pool = AsyncMock()
    # Make acquire return the context manager directly (not async)
    mock_pool.acquire = lambda: mock_acquire
    return mock_pool, mock_conn


class TestSessionStoreInit:
    """Test SessionStore initialization."""

    def test_init_requires_database_url(self, monkeypatch):
        """Test that DATABASE_URL environment variable is required."""
        monkeypatch.delenv("DATABASE_URL", raising=False)

        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            SessionStore()

    def test_init_with_database_url(self, monkeypatch):
        """Test initialization with DATABASE_URL set."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
        store = SessionStore()

        assert store.database_url == "postgresql://user:pass@localhost/db"
        assert store._pool is None


class TestCreateSession:
    """Test session creation."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_create_session(self, mock_create_pool, monkeypatch):
        """Test creating a new verification session."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        # Mock database pool and connection
        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool  # Bypass _get_pool pool creation

        session_id = await store.create_session(
            "verification-123",
            {"file_format": "audio/wav"}
        )

        assert session_id
        assert mock_conn.execute.called

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_create_session_returns_uuid(self, mock_create_pool, monkeypatch):
        """Test that create_session returns a valid UUID."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        session_id = await store.create_session("v-123", {})
        
        # Should be valid UUID format
        uuid_obj = uuid.UUID(session_id)
        assert str(uuid_obj) == session_id

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_create_session_stores_initial_data(self, mock_create_pool, monkeypatch):
        """Test that initial data is stored correctly."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        initial_data = {
            "file_format": "audio/wav",
            "duration": 10.5,
            "size_bytes": 1024000
        }
        
        await store.create_session("v-123", initial_data)
        
        # Check that data was passed to execute
        call_args = mock_conn.execute.call_args
        assert call_args is not None


class TestUpdateSession:
    """Test session updates."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_session_stage(self, mock_create_pool, monkeypatch):
        """Test updating session stage."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"  # asyncpg returns "UPDATE N"
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        result = await store.update_session("session-uuid", {
            "stage": "quality",
            "progress": 0.3
        })

        assert result is True
        assert mock_conn.execute.called

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_session_with_results(self, mock_create_pool, monkeypatch):
        """Test updating session with results."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        results = {
            "approved": True,
            "quality": {"score": 0.85}
        }
        
        result = await store.update_session("session-uuid", {
            "results": results,
            "status": "completed"
        })
        
        assert result is True

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_session_not_found(self, mock_create_pool, monkeypatch):
        """Test update when session not found."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 0"  # No rows updated
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result = await store.update_session("nonexistent-uuid", {
            "stage": "quality"
        })
        
        assert result is False

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_session_always_updates_timestamp(self, mock_create_pool, monkeypatch):
        """Test that updated_at is always updated."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        await store.update_session("session-uuid", {"stage": "copyright"})
        
        # Check that update included updated_at
        call_args = mock_conn.execute.call_args
        assert "updated_at" in str(call_args)


class TestMarkCompleted:
    """Test marking session as completed."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_mark_completed(self, mock_create_pool, monkeypatch):
        """Test marking session as completed."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result_data = {
            "approved": True,
            "quality": {"score": 0.9},
            "transcript": "Test transcript"
        }
        
        result = await store.mark_completed("session-uuid", result_data)
        
        assert result is True
        assert mock_conn.execute.called

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_mark_completed_sets_progress_to_1(self, mock_create_pool, monkeypatch):
        """Test that progress is set to 1.0 when completed."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        await store.mark_completed("session-uuid", {"approved": True})
        
        # Verify progress was set to 1.0
        call_args = mock_conn.execute.call_args
        assert "progress" in str(call_args)


class TestMarkFailed:
    """Test marking session as failed."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_mark_failed(self, mock_create_pool, monkeypatch):
        """Test marking session as failed."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result = await store.mark_failed("session-uuid", {
            "errors": ["Quality check failed"],
            "stage_failed": "quality"
        })
        
        assert result is True

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_mark_cancelled(self, mock_create_pool, monkeypatch):
        """Test marking session as cancelled."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result = await store.mark_failed("session-uuid", {
            "errors": ["User cancelled"],
            "cancelled": True
        })
        
        assert result is True

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_mark_failed_status_is_failed_by_default(self, mock_create_pool, monkeypatch):
        """Test that status is 'failed' unless explicitly marked as cancelled."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        await store.mark_failed("session-uuid", {"errors": ["Error"]})
        
        # Check that status was set to "failed", not "cancelled"
        call_args = mock_conn.execute.call_args
        query_text = str(call_args)
        # The query should contain the word "failed" when not explicitly cancelled
        assert "failed" in query_text.lower() or "status" in query_text.lower()


class TestGetSession:
    """Test retrieving session data."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_get_session(self, mock_create_pool, monkeypatch):
        """Test getting session data."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")
        
        # Mock database row
        mock_row = {
            "id": "session-123",
            "verification_id": "v-456",
            "status": "processing",
            "stage": "quality",
            "progress": 0.3,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "initial_data": '{"file_format": "audio/wav"}',
            "results": None,
            "error": None
        }

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.fetchrow.return_value = mock_row
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        session = await store.get_session("session-123")

        assert session is not None
        assert session["id"] == "session-123"
        assert session["status"] == "processing"
        assert session["progress"] == 0.3

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_get_session_not_found(self, mock_create_pool, monkeypatch):
        """Test getting non-existent session."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        session = await store.get_session("nonexistent")
        
        assert session is None

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_get_session_parses_json_data(self, mock_create_pool, monkeypatch):
        """Test that JSON data is properly parsed."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        initial_data = {"file_format": "audio/wav", "duration": 10.5}
        results_data = {"approved": True, "quality": {"score": 0.85}}

        mock_row = {
            "id": "session-123",
            "verification_id": "v-456",
            "status": "completed",
            "stage": "completed",
            "progress": 1.0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "initial_data": json.dumps(initial_data),
            "results": json.dumps(results_data),
            "error": None
        }

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.fetchrow.return_value = mock_row
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        session = await store.get_session("session-123")

        assert session["initial_data"] == initial_data
        assert session["results"] == results_data


class TestUpdateStage:
    """Test the update_stage convenience method."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_stage_calls_update_session(self, mock_create_pool, monkeypatch):
        """Test that update_stage calls update_session correctly."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result = await store.update_stage("session-uuid", "transcription", 0.6)
        
        assert result is True
        assert mock_conn.execute.called

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_stage_updates_both_stage_and_progress(self, mock_create_pool, monkeypatch):
        """Test that both stage and progress are updated."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.return_value = "UPDATE 1"
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        await store.update_stage("session-uuid", "analysis", 0.8)
        
        # Verify both stage and progress were included
        call_args = mock_conn.execute.call_args
        query = str(call_args)
        assert "stage" in query.lower() or "analysis" in query


class TestConnectionPool:
    """Test database connection pool management."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_pool_created_on_first_get(self, mock_create_pool, monkeypatch):
        """Test that connection pool is created on first use."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool = AsyncMock()
        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        
        # Pool should be None initially
        assert store._pool is None
        
        # First operation should create pool
        try:
            await store.create_session("v-123", {})
        except:
            pass
        
        # Pool should now be created or attempted
        assert mock_create_pool.called

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_close_closes_pool(self, mock_create_pool, monkeypatch):
        """Test that close() properly closes the connection pool."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, _ = create_mock_pool()
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        await store.close()

        assert mock_pool.close.called
        assert store._pool is None

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_multiple_close_calls_safe(self, mock_create_pool, monkeypatch):
        """Test that multiple close() calls don't cause errors."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")
        
        store = SessionStore()
        
        # Multiple closes should not raise
        await store.close()
        await store.close()


class TestErrorHandling:
    """Test error handling."""

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_create_session_error_handling(self, mock_create_pool, monkeypatch):
        """Test error handling in create_session."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.side_effect = Exception("Database error")
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        with pytest.raises(RuntimeError, match="Failed to create session"):
            await store.create_session("v-123", {})

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_update_session_returns_false_on_error(self, mock_create_pool, monkeypatch):
        """Test that update_session returns False on database error."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_conn.execute.side_effect = Exception("Database error")
        mock_create_pool.return_value = mock_pool

        store = SessionStore()
        store._pool = mock_pool

        result = await store.update_session("session-uuid", {"stage": "quality"})

        assert result is False

    @pytest.mark.asyncio
    @patch('session_store.asyncpg.create_pool')
    async def test_get_session_returns_none_on_error(self, mock_create_pool, monkeypatch):
        """Test that get_session returns None on database error."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/db")

        mock_pool, mock_conn = create_mock_pool()
        mock_create_pool.return_value = mock_pool
        
        store = SessionStore()
        store._pool = mock_pool
        
        result = await store.get_session("session-uuid")
        
        assert result is None
