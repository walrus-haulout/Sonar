"""In-memory FakeSessionStore for integration testing."""

from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional
import uuid


@dataclass
class SessionStageTransition:
    """Capture a stage transition for testing."""
    stage: str
    progress: float
    timestamp: datetime
    metadata: dict = field(default_factory=dict)


@dataclass
class FakeSession:
    """In-memory session object."""
    id: str
    status: str = "pending"
    progress: float = 0.0
    stage: str = ""
    result: Optional[dict] = None
    error: Optional[str] = None
    cancelled: bool = False
    stage_transitions: list = field(default_factory=list)


class FakeSessionStore:
    """In-memory session store that tracks stage transitions for testing."""

    def __init__(self):
        self.sessions: dict[str, FakeSession] = {}
        self.stage_order = [
            "quality_check",
            "copyright_check",
            "transcription",
            "analysis",
            "aggregation",
            "finalization",
        ]

    async def create_session(
        self,
        session_id: str,
        metadata: dict | None = None,
    ) -> str:
        """Create a new session.

        Args:
            session_id: Verification ID (UUID)
            metadata: Session metadata dict

        Returns:
            Session object ID for retrieval
        """
        object_id = str(uuid.uuid4())
        self.sessions[object_id] = FakeSession(id=object_id)
        return object_id

    async def get_session(self, session_id: str) -> dict | None:
        """Get session by ID."""
        if session_id not in self.sessions:
            return None
        session = self.sessions[session_id]
        return {
            "id": session.id,
            "status": session.status,
            "progress": session.progress,
            "stage": session.stage,
            "result": session.result,
            "error": session.error,
            "cancelled": session.cancelled,
        }

    async def update_session(self, session_id: str, updates: dict) -> bool:
        """Update session fields."""
        if session_id not in self.sessions:
            return False
        session = self.sessions[session_id]
        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)
        return True

    async def update_stage(
        self, session_id: str, stage: str, progress: float, metadata: dict | None = None
    ) -> bool:
        """Update stage and progress, recording transition."""
        if session_id not in self.sessions:
            return False
        session = self.sessions[session_id]
        session.stage = stage
        session.progress = progress
        session.status = "processing"
        session.stage_transitions.append(
            SessionStageTransition(
                stage=stage,
                progress=progress,
                timestamp=datetime.now(UTC),
                metadata=metadata or {},
            )
        )
        return True

    async def mark_completed(self, session_id: str, result: dict) -> bool:
        """Mark session as completed."""
        if session_id not in self.sessions:
            return False
        session = self.sessions[session_id]
        session.status = "completed"
        session.progress = 1.0
        session.result = result
        return True

    async def mark_failed(self, session_id: str, error_data: dict) -> bool:
        """Mark session as failed.

        Args:
            session_id: Session ID
            error_data: Error information dict
        """
        if session_id not in self.sessions:
            return False
        session = self.sessions[session_id]
        session.status = "failed"
        # Handle both string errors and dict error_data
        if isinstance(error_data, dict):
            session.error = str(error_data)
            # Check if this is a cancellation
            if error_data.get("cancelled"):
                session.cancelled = True
                session.status = "cancelled"
        else:
            session.error = str(error_data)
        return True

    async def cancel_session(self, session_id: str) -> bool:
        """Cancel a session."""
        if session_id not in self.sessions:
            return False
        session = self.sessions[session_id]
        session.cancelled = True
        session.status = "cancelled"
        return True

    def get_stage_transitions(self, session_id: str) -> list[SessionStageTransition]:
        """Get all stage transitions for a session (test helper)."""
        if session_id not in self.sessions:
            return []
        return self.sessions[session_id].stage_transitions
