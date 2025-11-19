import pytest
from hypothesis import given, strategies as st
from wallet_manager import WalletManager


class TestWalletManager_PropertyBased:
    @given(
        session_id=st.uuids().map(str),
        index=st.integers(min_value=0, max_value=255),
    )
    @pytest.mark.asyncio
    async def test_wallet_address_format(self, session_id, index):
        manager = WalletManager("redis://fake")
        manager.redis = None
        wallet = await manager.create_ephemeral_wallet(session_id, index)
        assert wallet.address.startswith('0x')
        assert len(wallet.address) == 66
        assert all(c in '0123456789abcdef' for c in wallet.address[2:])

    @given(
        session_id=st.uuids().map(str),
        index=st.integers(min_value=0, max_value=255),
    )
    @pytest.mark.asyncio
    async def test_wallet_private_key_format(self, session_id, index):
        manager = WalletManager("redis://fake")
        manager.redis = None
        wallet = await manager.create_ephemeral_wallet(session_id, index)
        assert len(wallet.private_key) == 128
        assert all(c in '0123456789abcdef' for c in wallet.private_key)

    @given(
        session_id=st.uuids().map(str),
        indices=st.lists(st.integers(min_value=0, max_value=100), min_size=2, max_size=20),
    )
    @pytest.mark.asyncio
    async def test_different_wallets_are_unique(self, session_id, indices):
        manager = WalletManager("redis://fake")
        manager.redis = None
        wallets = []
        for idx in indices:
            wallet = await manager.create_ephemeral_wallet(session_id, idx)
            wallets.append(wallet)

        addresses = [w.address for w in wallets]
        private_keys = [w.private_key for w in wallets]

        assert len(set(addresses)) == len(wallets), "Addresses should be unique"
        assert len(set(private_keys)) == len(wallets), "Private keys should be unique"

    @given(
        session_id=st.uuids().map(str),
        wallet_count=st.integers(min_value=1, max_value=256),
    )
    @pytest.mark.asyncio
    async def test_create_wallet_pool_count(self, session_id, wallet_count):
        manager = WalletManager("redis://fake")
        manager.redis = None
        wallets = await manager.create_wallet_pool(session_id, wallet_count)
        assert len(wallets) == wallet_count
        assert all(w.address and w.private_key for w in wallets)
