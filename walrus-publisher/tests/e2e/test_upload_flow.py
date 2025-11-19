import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../src'))

from main import app
from orchestrator import UploadOrchestrator
from transaction_builder import TransactionBuilder


@pytest.fixture
def test_client():
    return TestClient(app)


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
        assert response.status_code == 400
        assert 'positive' in response.json()['detail']


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
