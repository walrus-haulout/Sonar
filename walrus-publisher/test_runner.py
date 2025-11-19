#!/usr/bin/env python3
"""Standalone test runner without pytest dependency"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from chunking import ChunkingOrchestrator, ChunkInfo
import asyncio

# Import transaction_builder with optional pysui
try:
    from transaction_builder import TransactionBuilder
    HAS_PYSUI = True
except ImportError:
    HAS_PYSUI = False
    print("⚠ Skipping pysui-dependent tests (pysui not installed)")

# Import wallet_manager with optional redis
try:
    from wallet_manager import WalletManager
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False
    print("⚠ Skipping redis-dependent tests (redis not installed)")


def test_chunking_small_file():
    orch = ChunkingOrchestrator()
    count = orch.calculate_wallet_count(100 * 1024 * 1024)
    assert count == 4, f"Expected 4, got {count}"
    print("✓ test_chunking_small_file")


def test_chunking_large_file():
    orch = ChunkingOrchestrator()
    count = orch.calculate_wallet_count(10 * 1024**3)
    assert count <= 256 and count >= 4
    print("✓ test_chunking_large_file")


def test_plan_chunks_zero_bytes():
    orch = ChunkingOrchestrator()
    chunks = orch.plan_chunks(0)
    assert len(chunks) == 0
    print("✓ test_plan_chunks_zero_bytes")


def test_plan_chunks_small():
    orch = ChunkingOrchestrator()
    size = 10 * 1024 * 1024
    chunks = orch.plan_chunks(size)
    total = sum(c.size for c in chunks)
    assert total == size, f"Expected {size}, got {total}"
    print("✓ test_plan_chunks_small")


def test_validate_chunks_valid():
    orch = ChunkingOrchestrator()
    # Use chunks >= min_chunk_size to pass validation
    chunk_size = orch.min_chunk_size
    chunks = [
        ChunkInfo(index=0, size=chunk_size, wallet_index=0, offset=0),
        ChunkInfo(index=1, size=chunk_size, wallet_index=1, offset=chunk_size),
    ]
    assert orch.validate_chunks(chunk_size * 2, chunks) is True
    print("✓ test_validate_chunks_valid")


def test_validate_chunks_invalid():
    orch = ChunkingOrchestrator()
    chunks = [
        ChunkInfo(index=0, size=1024, wallet_index=0, offset=0),
    ]
    assert orch.validate_chunks(2048, chunks) is False
    print("✓ test_validate_chunks_invalid")


async def test_wallet_creation():
    if not HAS_REDIS:
        return
    manager = WalletManager("redis://fake")
    manager.redis = None
    wallet = await manager.create_ephemeral_wallet("session_123", 0)
    assert wallet.address.startswith('0x')
    assert len(wallet.address) == 66
    assert len(wallet.private_key) == 128
    print("✓ test_wallet_creation")


async def test_wallet_pool():
    if not HAS_REDIS:
        return
    manager = WalletManager("redis://fake")
    manager.redis = None
    wallets = await manager.create_wallet_pool("session_456", 5)
    assert len(wallets) == 5
    addresses = {w.address for w in wallets}
    assert len(addresses) == 5
    print("✓ test_wallet_pool")


def test_transaction_builder_init():
    if not HAS_PYSUI:
        return
    builder = TransactionBuilder(
        walrus_package_id="0x1234567890abcdef",
        walrus_system_object="0x0000000000000000000000000000000000000000000000000000000000000000",
    )
    assert builder.walrus_package_id == "0x1234567890abcdef"
    print("✓ test_transaction_builder_init")


def test_transaction_builder_missing_config():
    if not HAS_PYSUI:
        return
    try:
        TransactionBuilder(walrus_package_id=None, walrus_system_object="0x0")
        assert False, "Should have raised ValueError"
    except ValueError:
        print("✓ test_transaction_builder_missing_config")


def test_transaction_builder_whitespace():
    if not HAS_PYSUI:
        return
    builder = TransactionBuilder(
        walrus_package_id="  0x1234567890abcdef  ",
        walrus_system_object="  0x0000000000000000000000000000000000000000000000000000000000000000  ",
    )
    assert builder.walrus_package_id == "0x1234567890abcdef"
    assert builder.walrus_system_object == "0x0000000000000000000000000000000000000000000000000000000000000000"
    print("✓ test_transaction_builder_whitespace")


async def run_async_tests():
    await test_wallet_creation()
    await test_wallet_pool()


def main():
    print("=" * 60)
    print("Running standalone tests (no pytest required)")
    print("=" * 60)

    tests = [
        test_chunking_small_file,
        test_chunking_large_file,
        test_plan_chunks_zero_bytes,
        test_plan_chunks_small,
        test_validate_chunks_valid,
        test_validate_chunks_invalid,
        test_transaction_builder_init,
        test_transaction_builder_missing_config,
        test_transaction_builder_whitespace,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"✗ {test.__name__}: AssertionError: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: {type(e).__name__}: {e}")
            failed += 1

    # Run async tests only if redis is available
    if HAS_REDIS:
        asyncio.run(run_async_tests())
        passed += 2

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    if not HAS_PYSUI:
        print("(Pysui tests skipped - pysui module not installed)")
    if not HAS_REDIS:
        print("(Redis tests skipped - redis module not installed)")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
