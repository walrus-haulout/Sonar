import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import redis.asyncio as redis
import json

from models import UploadStatus, ChunkPlan
from chunking import ChunkingOrchestrator, ChunkInfo
from wallet_manager import WalletManager, WalletInfo
from config.platform import Config


class UploadSession:
    """Represents an active upload session."""

    def __init__(
        self,
        session_id: str,
        file_size: int,
        chunks: List[ChunkInfo],
        wallets: List[WalletInfo],
    ):
        self.session_id = session_id
        self.file_size = file_size
        self.chunks = chunks
        self.wallets = wallets
        self.blob_ids: Dict[int, str] = {}  # chunk_index -> blob_id
        self.chunks_uploaded = 0
        self.bytes_uploaded = 0
        self.transactions_submitted = 0
        self.transactions_confirmed = 0
        self.created_at = datetime.utcnow()
        self.error: Optional[str] = None

    def to_status(self) -> UploadStatus:
        """Convert to UploadStatus model."""
        return UploadStatus(
            session_id=self.session_id,
            status="completed" if self.chunks_uploaded == len(self.chunks) else "in_progress",
            chunks_uploaded=self.chunks_uploaded,
            total_chunks=len(self.chunks),
            bytes_uploaded=self.bytes_uploaded,
            total_bytes=self.file_size,
            transactions_submitted=self.transactions_submitted,
            transactions_confirmed=self.transactions_confirmed,
            error=self.error,
            created_at=self.created_at,
            updated_at=datetime.utcnow(),
        )


class UploadOrchestrator:
    """Orchestrates the entire upload process."""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None
        self.chunker = ChunkingOrchestrator()
        self.wallet_manager = WalletManager(redis_url)
        self.sessions: Dict[str, UploadSession] = {}

    async def connect(self):
        """Connect to Redis."""
        self.redis = await redis.from_url(self.redis_url, decode_responses=True)
        await self.wallet_manager.connect()

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis:
            await self.redis.close()
        await self.wallet_manager.disconnect()

    async def create_upload_session(self, file_size: int) -> tuple[str, List[ChunkPlan]]:
        """
        Create a new upload session.
        Returns (session_id, chunk_plans).
        """
        session_id = str(uuid.uuid4())
        chunks = self.chunker.plan_chunks(file_size)

        # Validate chunks
        if not self.chunker.validate_chunks(file_size, chunks):
            raise ValueError("Invalid chunk plan generated")

        wallet_count = self.chunker.calculate_wallet_count(file_size)
        wallets = await self.wallet_manager.create_wallet_pool(session_id, wallet_count)

        # Create session
        session = UploadSession(session_id, file_size, chunks, wallets)
        self.sessions[session_id] = session

        # Store in Redis
        session_data = {
            "session_id": session_id,
            "file_size": file_size,
            "wallet_count": wallet_count,
            "chunk_count": len(chunks),
            "created_at": datetime.utcnow().isoformat(),
        }
        if self.redis:
            await self.redis.setex(
                f"session:{session_id}",
                Config.SESSION_TTL,
                json.dumps(session_data),
            )

        # Create chunk plans
        chunk_plans = [
            ChunkPlan(
                index=chunk.index,
                size=chunk.size,
                wallet_address=wallets[chunk.wallet_index].address,
            )
            for chunk in chunks
        ]

        return session_id, chunk_plans

    async def get_session(self, session_id: str) -> Optional[UploadSession]:
        """Retrieve an upload session."""
        # Try memory cache first
        if session_id in self.sessions:
            return self.sessions[session_id]

        # Try Redis
        if self.redis:
            session_data = await self.redis.get(f"session:{session_id}")
            if session_data:
                # Reconstruct from Redis (simplified - in production, store full state)
                return None  # Would need to rebuild from stored data

        return None

    async def record_chunk_upload(self, session_id: str, chunk_index: int, blob_id: str):
        """Record that a chunk was successfully uploaded."""
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        chunk = next((c for c in session.chunks if c.index == chunk_index), None)
        if not chunk:
            raise ValueError(f"Chunk {chunk_index} not found in session")

        session.blob_ids[chunk_index] = blob_id
        session.chunks_uploaded += 1
        session.bytes_uploaded += chunk.size

        # Update Redis
        if self.redis:
            await self.redis.hset(
                f"session:{session_id}:chunks",
                str(chunk_index),
                blob_id,
            )

    async def record_transaction_submitted(self, session_id: str):
        """Record that a transaction was submitted."""
        session = await self.get_session(session_id)
        if session:
            session.transactions_submitted += 1

    async def record_transaction_confirmed(self, session_id: str):
        """Record that a transaction was confirmed on-chain."""
        session = await self.get_session(session_id)
        if session:
            session.transactions_confirmed += 1

    async def get_upload_status(self, session_id: str) -> Optional[UploadStatus]:
        """Get current upload status."""
        session = await self.get_session(session_id)
        if not session:
            return None
        return session.to_status()

    async def cleanup_session(self, session_id: str):
        """Clean up a completed or failed session."""
        session = self.sessions.pop(session_id, None)
        if session:
            await self.wallet_manager.cleanup_session(session_id, len(session.wallets))

    async def get_wallet_for_chunk(
        self, session_id: str, chunk_index: int
    ) -> Optional[WalletInfo]:
        """Get the wallet assigned to a specific chunk."""
        session = await self.get_session(session_id)
        if not session:
            return None

        chunk = next((c for c in session.chunks if c.index == chunk_index), None)
        if not chunk:
            return None

        return session.wallets[chunk.wallet_index]
