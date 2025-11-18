import os
import uuid
from hashlib import sha256
from typing import Optional
import redis.asyncio as redis
from pydantic import BaseModel


class WalletInfo(BaseModel):
    address: str
    private_key: str


class WalletManager:
    """Manages ephemeral sub-wallet creation and storage."""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        self.redis = await redis.from_url(self.redis_url, decode_responses=True)

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis:
            await self.redis.close()

    async def create_ephemeral_wallet(self, session_id: str, index: int) -> WalletInfo:
        """Create an ephemeral sub-wallet for a specific chunk."""
        if not self.redis:
            await self.connect()

        # In production, use Sui SDK to generate keys
        # For now, use a deterministic key generation from session
        seed = f"{session_id}:{index}".encode()
        private_key = sha256(seed).hexdigest()[:64]

        # Store in Redis with TTL
        wallet_key = f"wallet:{session_id}:{index}"
        if self.redis:
            await self.redis.setex(wallet_key, 3600, private_key)

        # Generate address from private key (simplified)
        # In production, use Sui SDK's actual key derivation
        address = f"0x{sha256(private_key.encode()).hexdigest()[:40]}"

        return WalletInfo(address=address, private_key=private_key)

    async def get_wallet(self, session_id: str, index: int) -> Optional[WalletInfo]:
        """Retrieve a wallet from Redis."""
        if not self.redis:
            await self.connect()

        wallet_key = f"wallet:{session_id}:{index}"
        if not self.redis:
            return None
        private_key = await self.redis.get(wallet_key)

        if not private_key:
            return None

        address = f"0x{sha256(private_key.encode()).hexdigest()[:40]}"
        return WalletInfo(address=address, private_key=private_key)

    async def create_wallet_pool(
        self, session_id: str, wallet_count: int
    ) -> list[WalletInfo]:
        """Create a pool of ephemeral wallets for an upload session."""
        wallets = []
        for i in range(wallet_count):
            wallet = await self.create_ephemeral_wallet(session_id, i)
            wallets.append(wallet)
        return wallets

    async def cleanup_session(self, session_id: str, wallet_count: int):
        """Clean up all wallets for a session."""
        if not self.redis:
            await self.connect()

        if not self.redis:
            return

        for i in range(wallet_count):
            wallet_key = f"wallet:{session_id}:{i}"
            await self.redis.delete(wallet_key)

        # Also clean up session data
        session_keys = await self.redis.keys(f"session:{session_id}:*")
        if session_keys:
            await self.redis.delete(*session_keys)
