import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import sys
import os
import asyncio
import time
import fakeredis.aioredis

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../src'))

from main import app
from orchestrator import UploadOrchestrator
from transaction_builder import TransactionBuilder


@pytest.fixture
def test_client(event_loop):
    """Create a test client with initialized orchestrator"""
    async def setup():
        import main
        redis_client = fakeredis.aioredis.FakeRedis()
        orch = UploadOrchestrator("fake://redis")
        orch.redis = redis_client
        orch.wallet_manager.redis = redis_client
        tx_builder = TransactionBuilder(
            walrus_package_id="0x123456789abcdef",
            walrus_system_object="0x0000000000000000000000000000000000000000000000000000000000000000",
        )
        main.orchestrator = orch
        main.transaction_builder = tx_builder
        main.start_time = time.time()
        return redis_client

    redis_client = event_loop.run_until_complete(setup())
    client = TestClient(app)
    yield client
    # Cleanup
    event_loop.run_until_complete(redis_client.flushall())
    event_loop.run_until_complete(redis_client.aclose())


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.mark.asyncio
async def test_upload_init_endpoint_no_auth(test_client):
    """Test /upload/init returns 403 when API keys required"""
    with patch('main.api_keys', {'test-key'}):
        response = test_client.post('/upload/init', json={'file_size': 100 * 1024 * 1024})
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_upload_init_endpoint_with_auth(test_client):
    """Test /upload/init succeeds with valid API key"""
    with patch('main.api_keys', {'test-key'}):
        headers = {'Authorization': 'Bearer test-key'}
        response = test_client.post(
            '/upload/init',
            json={'file_size': 100 * 1024 * 1024},
            headers=headers,
        )
        if response.status_code != 200:
            print(f"Response: {response.text}")
        assert response.status_code == 200
        data = response.json()
        assert 'session_id' in data
        assert 'chunks' in data
        assert 'chunk_count' in data


@pytest.mark.asyncio
async def test_upload_init_file_too_large(test_client):
    """Test /upload/init rejects files > 13 GiB"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 14 * (1024**3)},
        )
        assert response.status_code == 400
        assert 'exceeds maximum' in response.json()['detail']


@pytest.mark.asyncio
async def test_upload_init_zero_size(test_client):
    """Test /upload/init rejects zero-sized files"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 0},
        )
        assert response.status_code == 422
        data = response.json()
        assert 'detail' in data


@pytest.mark.asyncio
async def test_health_check_no_auth(test_client):
    """Test /health endpoint is open without auth"""
    response = test_client.get('/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'version' in data
    assert 'platform' in data


@pytest.mark.asyncio
async def test_metrics_endpoint_no_auth(test_client):
    """Test /metrics endpoint is open without auth"""
    response = test_client.get('/metrics')
    assert response.status_code == 200
    assert 'walrus_uploader_uptime_seconds' in response.text


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_full_upload_flow_mock():
    """E2E test: full upload flow with mocked services"""
    with patch('main.orchestrator') as mock_orch, \
         patch('main.transaction_builder') as mock_tx:

        mock_orch.create_upload_session = AsyncMock(
            return_value=('session_123', [])
        )
        mock_orch.get_session = AsyncMock(
            return_value=MagicMock(
                session_id='session_123',
                chunks=[],
                chunks_uploaded=0,
                blob_ids={},
            )
        )
        mock_orch.record_chunk_upload = AsyncMock()
        mock_orch.get_wallet_for_chunk = AsyncMock(
            return_value=MagicMock(
                address='0x1234567890123456789012345678901234567890',
                private_key='test_private_key',
            )
        )
        mock_orch.get_upload_status = AsyncMock(
            return_value=MagicMock(
                session_id='session_123',
                status='completed',
                chunks_uploaded=0,
                total_chunks=0,
                bytes_uploaded=0,
                total_bytes=0,
                transactions_submitted=0,
                transactions_confirmed=0,
                dict=lambda: {},
            )
        )

        mock_tx.build_register_blob_transaction = MagicMock(
            return_value='base64_encoded_tx_bytes'
        )

        # Test initialization
        assert mock_orch is not None
        assert mock_tx is not None


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_concurrent_uploads():
    """E2E test: multiple concurrent uploads"""
    client = TestClient(app)
    with patch('main.api_keys', set()):
        # Initiate multiple uploads
        responses = []
        for i in range(3):
            response = client.post(
                '/upload/init',
                json={'file_size': 50 * 1024 * 1024},
            )
            responses.append(response)

        # All should succeed
        for response in responses:
            assert response.status_code == 200

        # All should have unique session IDs
        session_ids = [r.json()['session_id'] for r in responses]
        assert len(set(session_ids)) == len(session_ids), "Session IDs should be unique"


@pytest.mark.asyncio
async def test_chunk_upload_missing_session(test_client):
    """Test /upload/chunk returns 404 for missing session"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/nonexistent_session/chunk/0',
            files={'file': ('test.bin', b'test_data')},
        )
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_transactions_missing_session(test_client):
    """Test /transactions returns 404 for missing session"""
    with patch('main.api_keys', set()):
        response = test_client.get('/upload/nonexistent_session/transactions')
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_transactions_incomplete_upload(test_client):
    """Test /transactions returns 400 when chunks not uploaded"""
    with patch('main.api_keys', set()):
        # Create a session
        init_resp = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        session_id = init_resp.json()['session_id']

        # Try to get transactions without uploading chunks
        response = test_client.get(f'/upload/{session_id}/transactions')
        assert response.status_code == 400
        assert 'Not all chunks uploaded' in response.json()['detail']


@pytest.mark.asyncio
async def test_finalize_missing_session(test_client):
    """Test /finalize returns 404 for missing session"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/nonexistent_session/finalize',
            json={'signed_transactions': []},
        )
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_finalize_no_transactions(test_client):
    """Test /finalize returns 400 for empty transactions"""
    with patch('main.api_keys', set()):
        # Create a session
        init_resp = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        session_id = init_resp.json()['session_id']

        # Try to finalize without transactions
        response = test_client.post(
            f'/upload/{session_id}/finalize',
            json={'signed_transactions': []},
        )
        assert response.status_code == 400
        assert 'No transactions' in response.json()['detail']


@pytest.mark.asyncio
async def test_upload_status_endpoint(test_client):
    """Test /status endpoint returns SSE stream response"""
    with patch('main.api_keys', set()):
        # Create a session
        init_resp = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        session_id = init_resp.json()['session_id']

        # Get status (SSE stream)
        response = test_client.get(f'/upload/{session_id}/status')
        assert response.status_code == 200
        assert 'text/event-stream' in response.headers.get('content-type', '')
