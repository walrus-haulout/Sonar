from dataclasses import dataclass
from typing import List
from config.platform import Config


@dataclass
class ChunkInfo:
    index: int
    size: int
    wallet_index: int
    offset: int


class ChunkingOrchestrator:
    def __init__(self):
        self.min_chunk_size = Config.CHUNK_MIN_SIZE
        self.max_chunk_size = Config.CHUNK_MAX_SIZE
        self.max_wallets = Config.MAX_WALLETS

    def calculate_wallet_count(self, file_size: int) -> int:
        size_gb = file_size / (1024**3)
        wallet_count: int = 4 + int(size_gb * 4)
        return min(self.max_wallets, wallet_count)

    def calculate_chunk_size(self, file_size: int, wallet_count: int) -> int:
        chunk_size: int = file_size // wallet_count
        return min(max(chunk_size, self.min_chunk_size), self.max_chunk_size)

    def plan_chunks(self, file_size: int) -> List[ChunkInfo]:
        wallet_count = self.calculate_wallet_count(file_size)
        chunk_size = self.calculate_chunk_size(file_size, wallet_count)

        chunks: List[ChunkInfo] = []
        offset = 0
        chunk_index = 0

        while offset < file_size:
            # Last chunk gets remaining bytes
            remaining = file_size - offset
            current_chunk_size = min(chunk_size, remaining)

            chunk = ChunkInfo(
                index=chunk_index,
                size=current_chunk_size,
                wallet_index=chunk_index % wallet_count,
                offset=offset,
            )
            chunks.append(chunk)

            offset += current_chunk_size
            chunk_index += 1

        return chunks
