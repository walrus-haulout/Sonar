import pytest
from wallet_manager import WalletManager, WalletInfo


@pytest.mark.asyncio
async def test_create_ephemeral_wallet():
    manager = WalletManager("redis://fake")
    manager.redis = None
    wallet = await manager.create_ephemeral_wallet("session_123", 0)
    assert wallet.address.startswith("0x")
    assert len(wallet.address) == 66
    assert wallet.private_key
    assert len(wallet.private_key) == 128


@pytest.mark.asyncio
async def test_create_wallet_pool():
    manager = WalletManager("redis://fake")
    manager.redis = None
    wallets = await manager.create_wallet_pool("session_456", 5)
    assert len(wallets) == 5
    addresses = {w.address for w in wallets}
    assert len(addresses) == 5


@pytest.mark.asyncio
async def test_wallet_uniqueness():
    manager = WalletManager("redis://fake")
    manager.redis = None
    wallet1 = await manager.create_ephemeral_wallet("session_789", 0)
    wallet2 = await manager.create_ephemeral_wallet("session_789", 1)
    assert wallet1.address != wallet2.address
    assert wallet1.private_key != wallet2.private_key
