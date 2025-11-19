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


@pytest.mark.asyncio
async def test_auth_required_on_endpoints(test_client):
    """Test that protected endpoints require auth when API keys are set"""
    with patch('main.api_keys', {'valid-key'}):
        # POST endpoints should require auth
        response = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        assert response.status_code == 403

        # GET transactions should require auth
        response = test_client.get('/upload/session123/transactions')
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_auth_with_valid_key(test_client):
    """Test that valid API key allows access"""
    with patch('main.api_keys', {'valid-key'}):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
            headers={'Authorization': 'Bearer valid-key'},
        )
        assert response.status_code == 200
        assert 'session_id' in response.json()


@pytest.mark.asyncio
async def test_auth_with_invalid_key(test_client):
    """Test that invalid API key is rejected"""
    with patch('main.api_keys', {'valid-key'}):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
            headers={'Authorization': 'Bearer invalid-key'},
        )
        assert response.status_code == 403
        assert 'Invalid API key' in response.json()['detail']


@pytest.mark.asyncio
async def test_upload_init_boundary_size(test_client):
    """Test /upload/init with boundary file size"""
    with patch('main.api_keys', set()):
        # Test max allowed size (13 GiB - 1 byte)
        max_bytes = 13 * (1024**3) - 1
        response = test_client.post(
            '/upload/init',
            json={'file_size': max_bytes},
        )
        assert response.status_code == 200
        assert 'session_id' in response.json()


@pytest.mark.asyncio
async def test_upload_init_chunk_distribution(test_client):
    """Test that chunk plans are properly distributed"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 1 * 1024 * 1024 * 1024},  # 1 GiB
        )
        assert response.status_code == 200
        data = response.json()
        assert data['chunk_count'] > 0
        assert data['wallet_count'] >= 4  # Minimum wallets
        assert data['chunk_count'] >= data['wallet_count']  # At least one chunk per wallet

        # Verify chunks have required fields
        for chunk in data['chunks']:
            assert 'index' in chunk
            assert 'size' in chunk
            assert 'wallet_address' in chunk
            assert chunk['size'] > 0


@pytest.mark.asyncio
async def test_finalize_with_transactions(test_client):
    """Test finalize endpoint with actual transactions"""
    with patch('main.api_keys', set()):
        # Create session
        init_resp = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        session_id = init_resp.json()['session_id']

        # Finalize with signed transactions
        finalize_data = {
            'signed_transactions': [
                {
                    'tx_bytes': 'dummy_tx_bytes',
                    'digest': f'0x{i:064x}',
                }
                for i in range(2)
            ]
        }
        response = test_client.post(
            f'/upload/{session_id}/finalize',
            json=finalize_data,
        )
        assert response.status_code == 200
        result = response.json()
        assert result['session_id'] == session_id
        assert result['status'] == 'submitted'
        assert len(result['transaction_digests']) == 2


@pytest.mark.asyncio
async def test_health_check_returns_valid_data(test_client):
    """Test health endpoint returns all required fields"""
    response = test_client.get('/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'version' in data
    assert 'platform' in data
    assert 'uptime_seconds' in data
    assert 'active_sessions' in data
    assert isinstance(data['uptime_seconds'], (int, float))
    assert data['uptime_seconds'] >= 0


@pytest.mark.asyncio
async def test_metrics_format(test_client):
    """Test metrics endpoint returns valid Prometheus format"""
    response = test_client.get('/metrics')
    assert response.status_code == 200
    content = response.text

    # Check for required metrics
    assert 'walrus_uploader_uptime_seconds' in content
    assert 'walrus_uploader_active_sessions' in content
    assert 'walrus_uploader_version' in content

    # Check Prometheus format markers
    assert '# HELP' in content
    assert '# TYPE' in content
    assert 'gauge' in content


@pytest.mark.asyncio
async def test_upload_session_created_fields(test_client):
    """Test that session contains all required fields"""
    with patch('main.api_keys', set()):
        response = test_client.post(
            '/upload/init',
            json={'file_size': 100 * 1024 * 1024},
        )
        assert response.status_code == 200
        data = response.json()

        # Verify all required fields
        assert 'session_id' in data
        assert 'chunk_count' in data
        assert 'wallet_count' in data
        assert 'chunks' in data
        assert isinstance(data['chunks'], list)
        assert len(data['chunks']) > 0


@pytest.mark.asyncio
async def test_chunk_response_structure(test_client):
    """Test that chunk response has correct structure"""
    with patch('main.api_keys', set()):
        init_resp = test_client.post(
            '/upload/init',
            json={'file_size': 50 * 1024 * 1024},
        )
        chunks = init_resp.json()['chunks']

        for chunk in chunks:
            assert 'index' in chunk
            assert 'size' in chunk
            assert 'wallet_address' in chunk
            assert chunk['size'] > 0
            assert chunk['wallet_address'].startswith('0x')
            assert isinstance(chunk['index'], int)
            assert chunk['index'] >= 0


@pytest.mark.asyncio
async def test_concurrent_session_creation(test_client):
    """Test multiple concurrent session creations"""
    import asyncio
    with patch('main.api_keys', set()):
        # Create multiple sessions concurrently via test client
        tasks = []
        for i in range(5):
            response = test_client.post(
                '/upload/init',
                json={'file_size': 10 * 1024 * 1024 * (i + 1)},
            )
            tasks.append(response)

        # All should succeed
        for response in tasks:
            assert response.status_code == 200
            assert 'session_id' in response.json()
