from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ChunkPlan(BaseModel):
    index: int
    size: int
    wallet_address: str


class UploadInitRequest(BaseModel):
    file_size: int = Field(..., gt=0, description="Total file size in bytes")


class UploadInitResponse(BaseModel):
    session_id: str
    chunk_count: int
    wallet_count: int
    chunks: List[ChunkPlan]


class UploadChunkRequest(BaseModel):
    chunk_data: bytes


class ChunkUploadResponse(BaseModel):
    blob_id: str
    chunk_index: int
    size_bytes: int


class UnsignedTransaction(BaseModel):
    tx_bytes: str = Field(..., description="Base64-encoded transaction bytes")
    sub_wallet_address: str
    blob_id: str
    chunk_index: int


class TransactionsResponse(BaseModel):
    session_id: str
    transactions: List[UnsignedTransaction]
    sponsor_address: str = Field(..., description="Browser wallet address to sponsor gas")


class SignedTransaction(BaseModel):
    tx_bytes: str = Field(..., description="Signed transaction bytes")
    digest: Optional[str] = None


class FinalizeRequest(BaseModel):
    signed_transactions: List[SignedTransaction]


class FinalizeResponse(BaseModel):
    session_id: str
    transaction_digests: List[str]
    status: str = "submitted"


class UploadStatus(BaseModel):
    session_id: str
    status: str  # "in_progress", "completed", "failed"
    chunks_uploaded: int
    total_chunks: int
    bytes_uploaded: int
    total_bytes: int
    transactions_submitted: int
    transactions_confirmed: int
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    platform: str
    uptime_seconds: float
    active_sessions: int
