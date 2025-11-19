import os
from typing import Optional
import redis.asyncio as redis
from pydantic import BaseModel
from config.platform import Config

try:
    from pysui.sui.sui_crypto import SuiKeyPair
    HAS_PYSUI = True
except ImportError:
    HAS_PYSUI = False
    SuiKeyPair = None


class WalletInfo(BaseModel):
    address: str
    private_key: str


class WalletManager:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None

    async def connect(self):
        self.redis = await redis.from_url(self.redis_url, decode_responses=True)

    async def disconnect(self):
        if self.redis:
            await self.redis.close()

    async def _ensure_connected(self):
        if not self.redis:
            await self.connect()

    async def create_ephemeral_wallet(self, session_id: str, index: int) -> WalletInfo:
        await self._ensure_connected()
        if HAS_PYSUI and SuiKeyPair:
            keypair = SuiKeyPair.new_ed25519()
            private_key = keypair.private_key.hex()
            address = keypair.to_address().address
        else:
            import secrets
            private_key = secrets.token_hex(32)
            address = f"0x{secrets.token_hex(20)}"
        wallet_key = f"wallet:{session_id}:{index}"
        if self.redis:
            wallet_data = f"{private_key}|{address}"
            await self.redis.setex(wallet_key, Config.SESSION_TTL, wallet_data)
        return WalletInfo(address=address, private_key=private_key)

    async def get_wallet(self, session_id: str, index: int) -> Optional[WalletInfo]:
        await self._ensure_connected()
        if not self.redis:
            return None
        wallet_key = f"wallet:{session_id}:{index}"
        wallet_data = await self.redis.get(wallet_key)
        if not wallet_data:
            return None
        parts = wallet_data.split("|")
        if len(parts) != 2:
            return None
        private_key, address = parts
        return WalletInfo(address=address, private_key=private_key)

    async def create_wallet_pool(
        self, session_id: str, wallet_count: int
    ) -> list[WalletInfo]:
        wallets = []
        for i in range(wallet_count):
            wallet = await self.create_ephemeral_wallet(session_id, i)
            wallets.append(wallet)
        return wallets

    async def cleanup_session(self, session_id: str, wallet_count: int):
        await self._ensure_connected()
        if not self.redis:
            return
        for i in range(wallet_count):
            wallet_key = f"wallet:{session_id}:{i}"
            await self.redis.delete(wallet_key)
        session_keys = await self.redis.keys(f"session:{session_id}:*")
        if session_keys:
            await self.redis.delete(*session_keys)
