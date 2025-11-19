import pytest
from chunking import ChunkingOrchestrator, ChunkInfo


class TestChunkingOrchestrator:
    def test_calculate_wallet_count_small_file(self):
        orch = ChunkingOrchestrator()
        count = orch.calculate_wallet_count(100 * 1024 * 1024)
        assert count == 4

    def test_calculate_wallet_count_large_file(self):
        orch = ChunkingOrchestrator()
        count = orch.calculate_wallet_count(10 * 1024**3)
        assert count <= 256
        assert count >= 4

    def test_calculate_chunk_size(self):
        orch = ChunkingOrchestrator()
        size = orch.calculate_chunk_size(100 * 1024 * 1024, 4)
        assert orch.min_chunk_size <= size <= orch.max_chunk_size

    def test_plan_chunks_zero_bytes(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(0)
        assert len(chunks) == 0

    def test_plan_chunks_small_file(self):
        orch = ChunkingOrchestrator()
        size = 10 * 1024 * 1024
        chunks = orch.plan_chunks(size)
        assert len(chunks) > 0
        total = sum(c.size for c in chunks)
        assert total == size

    def test_plan_chunks_large_file(self):
        orch = ChunkingOrchestrator()
        size = 10 * 1024**3
        chunks = orch.plan_chunks(size)
        total = sum(c.size for c in chunks)
        assert total == size

    def test_validate_chunks_valid(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=0, size=1024, wallet_index=0, offset=0),
            ChunkInfo(index=1, size=1024, wallet_index=1, offset=1024),
        ]
        assert orch.validate_chunks(2048, chunks) is True

    def test_validate_chunks_size_mismatch(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=0, size=1024, wallet_index=0, offset=0),
        ]
        assert orch.validate_chunks(2048, chunks) is False

    def test_validate_chunks_index_mismatch(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=2, size=1024, wallet_index=0, offset=0),
        ]
        assert orch.validate_chunks(1024, chunks) is False

    def test_validate_chunks_offset_mismatch(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=0, size=1024, wallet_index=0, offset=100),
            ChunkInfo(index=1, size=1024, wallet_index=1, offset=1124),
        ]
        assert orch.validate_chunks(2048, chunks) is False

    def test_validate_chunks_empty(self):
        orch = ChunkingOrchestrator()
        assert orch.validate_chunks(100, []) is False
