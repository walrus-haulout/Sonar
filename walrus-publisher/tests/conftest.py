import pytest
import asyncio
import fakeredis.aioredis
from unittest.mock import AsyncMock, patch
from config.platform import Config
from orchestrator import UploadOrchestrator
from transaction_builder import TransactionBuilder
from chunking import ChunkingOrchestrator


@pytest.fixture
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def redis_client():
    client = fakeredis.aioredis.FakeRedis()
    yield client
    await client.flushall()
    await client.close()


@pytest.fixture
async def orchestrator(redis_client):
    orch = UploadOrchestrator("fake://redis")
    orch.redis = redis_client
    return orch


@pytest.fixture
def transaction_builder():
    return TransactionBuilder(
        walrus_package_id="0x123456789abcdef",
        walrus_system_object="0x0000000000000000000000000000000000000000000000000000000000000000",
    )


@pytest.fixture
def chunking_orchestrator():
    return ChunkingOrchestrator()


@pytest.fixture
def mock_walrus_uploader():
    with patch("main.WalrusUploader") as mock:
        uploader_instance = AsyncMock()
        uploader_instance.upload_chunk = AsyncMock(return_value="test_blob_id_123")
        uploader_instance.__aenter__.return_value = uploader_instance
        uploader_instance.__aexit__.return_value = None
        mock.return_value = uploader_instance
        yield mock
