import pytest
from hypothesis import given, strategies as st
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

    def test_calculate_wallet_count_respects_max(self):
        orch = ChunkingOrchestrator()
        count = orch.calculate_wallet_count(20 * 1024**3)
        assert count == orch.max_wallets

    def test_calculate_chunk_size(self):
        orch = ChunkingOrchestrator()
        size = orch.calculate_chunk_size(100 * 1024 * 1024, 4)
        assert orch.min_chunk_size <= size <= orch.max_chunk_size

    def test_plan_chunks_zero_bytes(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(0)
        assert len(chunks) == 0

    def test_plan_chunks_one_byte(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(1)
        assert len(chunks) == 1
        assert chunks[0].size == 1

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

    def test_plan_chunks_indices_sequential(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(100 * 1024 * 1024)
        for i, chunk in enumerate(chunks):
            assert chunk.index == i

    def test_plan_chunks_offsets_correct(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(10 * 1024 * 1024)
        offset = 0
        for chunk in chunks:
            assert chunk.offset == offset
            offset += chunk.size

    def test_plan_chunks_wallet_distribution(self):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(100 * 1024 * 1024)
        wallet_count = orch.calculate_wallet_count(100 * 1024 * 1024)
        wallets_used = set(c.wallet_index for c in chunks)
        assert len(wallets_used) <= wallet_count

    def test_validate_chunks_valid(self):
        orch = ChunkingOrchestrator()
        chunk_size = orch.min_chunk_size
        chunks = [
            ChunkInfo(index=0, size=chunk_size, wallet_index=0, offset=0),
            ChunkInfo(index=1, size=chunk_size, wallet_index=1, offset=chunk_size),
        ]
        assert orch.validate_chunks(chunk_size * 2, chunks) is True

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

    def test_validate_chunks_size_too_large(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=0, size=orch.max_chunk_size + 1, wallet_index=0, offset=0),
        ]
        assert orch.validate_chunks(orch.max_chunk_size + 1, chunks) is False

    def test_validate_chunks_empty(self):
        orch = ChunkingOrchestrator()
        assert orch.validate_chunks(100, []) is False

    def test_validate_chunks_last_chunk_can_be_small(self):
        orch = ChunkingOrchestrator()
        chunks = [
            ChunkInfo(index=0, size=orch.max_chunk_size, wallet_index=0, offset=0),
            ChunkInfo(index=1, size=100, wallet_index=1, offset=orch.max_chunk_size),
        ]
        assert orch.validate_chunks(orch.max_chunk_size + 100, chunks) is True


class TestChunkingOrchestrator_PropertyBased:
    @given(
        file_size=st.integers(min_value=1, max_value=13 * (1024**3)),
    )
    def test_planned_chunks_total_size(self, file_size):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(file_size)
        total = sum(c.size for c in chunks)
        assert total == file_size, f"Total {total} != file_size {file_size}"

    @given(
        file_size=st.integers(min_value=1, max_value=13 * (1024**3)),
    )
    def test_planned_chunks_are_valid(self, file_size):
        orch = ChunkingOrchestrator()
        chunks = orch.plan_chunks(file_size)
        assert orch.validate_chunks(file_size, chunks), "Planned chunks should be valid"

    @given(
        file_size=st.integers(min_value=1, max_value=13 * (1024**3)),
    )
    def test_wallet_count_in_range(self, file_size):
        orch = ChunkingOrchestrator()
        count = orch.calculate_wallet_count(file_size)
        assert count >= 4, "Wallet count too low"
        assert count <= orch.max_wallets, "Wallet count exceeds max"

    @given(
        file_size=st.integers(min_value=1, max_value=100 * 1024**3),
    )
    def test_chunk_size_respects_bounds(self, file_size):
        orch = ChunkingOrchestrator()
        wallet_count = orch.calculate_wallet_count(file_size)
        chunk_size = orch.calculate_chunk_size(file_size, wallet_count)
        assert chunk_size >= orch.min_chunk_size, "Chunk too small"
        assert chunk_size <= orch.max_chunk_size, "Chunk too large"
