import pytest
from hypothesis import given, strategies as st
from unittest.mock import AsyncMock, Mock, patch
from uploader import WalrusUploader
import httpx


@pytest.mark.asyncio
async def test_uploader_context_manager():
    async with WalrusUploader() as uploader:
        assert uploader.client is not None


@pytest.mark.asyncio
async def test_uploader_not_initialized():
    uploader = WalrusUploader()
    with pytest.raises(RuntimeError, match="not initialized"):
        await uploader.upload_chunk(b"test_data", 0)


@pytest.mark.asyncio
async def test_upload_chunk_success():
    with patch('uploader.httpx.AsyncClient') as mock_client_class:
        mock_response = AsyncMock()
        mock_response.json = Mock(return_value={'blobId': 'test_blob_id_123'})
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.put = AsyncMock(return_value=mock_response)
        mock_client.aclose = AsyncMock()
        mock_client_class.return_value = mock_client

        async with WalrusUploader() as uploader:
            blob_id = await uploader.upload_chunk(b"test_data", 0)
            assert blob_id == 'test_blob_id_123'


@pytest.mark.asyncio
async def test_upload_chunk_fallback_snake_case():
    with patch('uploader.httpx.AsyncClient') as mock_client_class:
        mock_response = AsyncMock()
        mock_response.json = Mock(return_value={'blob_id': 'test_blob_id_456'})
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.put = AsyncMock(return_value=mock_response)
        mock_client.aclose = AsyncMock()
        mock_client_class.return_value = mock_client

        async with WalrusUploader() as uploader:
            blob_id = await uploader.upload_chunk(b"test_data", 0)
            assert blob_id == 'test_blob_id_456'


@pytest.mark.asyncio
async def test_upload_chunk_missing_blob_id():
    with patch('uploader.httpx.AsyncClient') as mock_client_class:
        mock_response = AsyncMock()
        mock_response.json = Mock(return_value={'some_field': 'some_value'})
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.put = AsyncMock(return_value=mock_response)
        mock_client.aclose = AsyncMock()
        mock_client_class.return_value = mock_client

        async with WalrusUploader() as uploader:
            with pytest.raises(ValueError, match="No blob_id"):
                await uploader.upload_chunk(b"test_data", 0)


@pytest.mark.asyncio
async def test_upload_chunk_http_error():
    with patch('uploader.httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client.put = AsyncMock(
            side_effect=httpx.HTTPError("Connection error")
        )
        mock_client.aclose = AsyncMock()
        mock_client_class.return_value = mock_client

        async with WalrusUploader() as uploader:
            with pytest.raises(RuntimeError, match="Failed to upload chunk"):
                await uploader.upload_chunk(b"test_data", 0)


class TestWalrusUploader_PropertyBased:
    @given(
        chunk_size=st.integers(min_value=1, max_value=1024 * 1024),
        chunk_index=st.integers(min_value=0, max_value=1000),
    )
    @pytest.mark.asyncio
    async def test_upload_chunk_size_handling(self, chunk_size, chunk_index):
        with patch('uploader.httpx.AsyncClient') as mock_client_class:
            mock_response = AsyncMock()
            mock_response.json = Mock(return_value={'blobId': f'blob_{chunk_index}'})
            mock_response.raise_for_status = Mock()

            mock_client = AsyncMock()
            mock_client.put = AsyncMock(return_value=mock_response)
            mock_client.aclose = AsyncMock()
            mock_client_class.return_value = mock_client

            async with WalrusUploader() as uploader:
                data = b'x' * chunk_size
                blob_id = await uploader.upload_chunk(data, chunk_index)
                assert blob_id == f'blob_{chunk_index}'
                mock_client.put.assert_called_once()
