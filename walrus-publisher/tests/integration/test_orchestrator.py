import pytest
import json
from unittest.mock import AsyncMock, patch
from orchestrator import UploadOrchestrator


@pytest.mark.asyncio
async def test_create_upload_session(orchestrator):
    session_id, chunk_plans = await orchestrator.create_upload_session(100 * 1024 * 1024)
    assert session_id
    assert len(chunk_plans) > 0
    for plan in chunk_plans:
        assert plan.index >= 0
        assert plan.size > 0
        assert plan.wallet_address


@pytest.mark.asyncio
async def test_get_session_from_memory(orchestrator):
    session_id, _ = await orchestrator.create_upload_session(50 * 1024 * 1024)
    session = await orchestrator.get_session(session_id)
    assert session is not None
    assert session.session_id == session_id


@pytest.mark.asyncio
async def test_get_nonexistent_session(orchestrator):
    session = await orchestrator.get_session("nonexistent_id")
    assert session is None


@pytest.mark.asyncio
async def test_record_chunk_upload(orchestrator):
    session_id, _ = await orchestrator.create_upload_session(100 * 1024 * 1024)
    await orchestrator.record_chunk_upload(session_id, 0, "blob_id_123")
    session = await orchestrator.get_session(session_id)
    assert session is not None
    assert "0" in session.blob_ids or 0 in session.blob_ids


@pytest.mark.asyncio
async def test_get_upload_status(orchestrator):
    session_id, chunk_plans = await orchestrator.create_upload_session(10 * 1024 * 1024)
    status = await orchestrator.get_upload_status(session_id)
    assert status is not None
    assert status.session_id == session_id
    assert status.total_chunks == len(chunk_plans)
    assert status.chunks_uploaded == 0


@pytest.mark.asyncio
async def test_record_transaction_submitted(orchestrator):
    session_id, _ = await orchestrator.create_upload_session(50 * 1024 * 1024)
    initial_status = await orchestrator.get_upload_status(session_id)
    initial_submitted = initial_status.transactions_submitted
    await orchestrator.record_transaction_submitted(session_id)
    updated_status = await orchestrator.get_upload_status(session_id)
    assert updated_status.transactions_submitted == initial_submitted + 1


@pytest.mark.asyncio
async def test_cleanup_session(orchestrator):
    session_id, _ = await orchestrator.create_upload_session(30 * 1024 * 1024)
    assert session_id in orchestrator.sessions
    await orchestrator.cleanup_session(session_id)
    assert session_id not in orchestrator.sessions


@pytest.mark.asyncio
async def test_get_wallet_for_chunk(orchestrator):
    session_id, _ = await orchestrator.create_upload_session(100 * 1024 * 1024)
    wallet = await orchestrator.get_wallet_for_chunk(session_id, 0)
    assert wallet is not None
    assert wallet.address


@pytest.mark.asyncio
async def test_wallet_manager_disconnect(orchestrator):
    """Test wallet manager can disconnect"""
    redis_obj = orchestrator.wallet_manager.redis
    assert redis_obj is not None
    # Disconnect should not raise
    await orchestrator.wallet_manager.disconnect()


@pytest.mark.asyncio
async def test_multiple_sessions_concurrent(orchestrator):
    """Test creating multiple sessions concurrently"""
    import asyncio
    tasks = [
        orchestrator.create_upload_session(10 * 1024 * 1024)
        for _ in range(3)
    ]
    results = await asyncio.gather(*tasks)
    assert len(results) == 3
    session_ids = [result[0] for result in results]
    assert len(set(session_ids)) == 3, "Session IDs should be unique"


@pytest.mark.asyncio
async def test_wallet_cleanup_session(orchestrator):
    """Test wallet manager cleanup_session"""
    session_id = "test_session_cleanup"
    # Create a session
    _, chunk_plans = await orchestrator.create_upload_session(10 * 1024 * 1024)
    wallet_count = len(chunk_plans)

    # Cleanup should work
    await orchestrator.wallet_manager.cleanup_session(session_id, wallet_count)


@pytest.mark.asyncio
async def test_session_to_status_conversion(orchestrator):
    """Test converting UploadSession to UploadStatus"""
    session_id, _ = await orchestrator.create_upload_session(10 * 1024 * 1024)
    session = await orchestrator.get_session(session_id)

    # Convert to status
    status = session.to_status()
    assert status.session_id == session_id
    assert 'status' in status.dict()
    assert 'chunks_uploaded' in status.dict()


@pytest.mark.asyncio
async def test_get_wallet_for_valid_chunk(orchestrator):
    """Test getting wallet for existing chunk"""
    session_id, chunk_plans = await orchestrator.create_upload_session(10 * 1024 * 1024)
    # Get wallet for first chunk
    if chunk_plans:
        first_chunk_index = chunk_plans[0].index
        wallet = await orchestrator.get_wallet_for_chunk(session_id, first_chunk_index)
        assert wallet is not None
        assert wallet.address
        assert wallet.private_key


@pytest.mark.asyncio
async def test_invalid_file_size():
    """Test that zero file size raises"""
    import fakeredis.aioredis
    redis_client = fakeredis.aioredis.FakeRedis()
    orch = UploadOrchestrator("fake://redis")
    orch.redis = redis_client
    orch.wallet_manager.redis = redis_client

    with pytest.raises(ValueError):
        await orch.create_upload_session(0)
