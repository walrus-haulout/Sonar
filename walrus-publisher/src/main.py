import time
import asyncio
from datetime import datetime
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import uvicorn

from config.platform import Config
from models import (
    UploadInitRequest,
    UploadInitResponse,
    ChunkUploadResponse,
    TransactionsResponse,
    UnsignedTransaction,
    FinalizeRequest,
    FinalizeResponse,
    HealthResponse,
)
from orchestrator import UploadOrchestrator
from uploader import WalrusUploader
from transaction_builder import TransactionBuilder


orchestrator: UploadOrchestrator
transaction_builder: TransactionBuilder
start_time: float


app = FastAPI(
    title="Walrus Publisher",
    version=Config.VERSION,
    description="High-performance Walrus blob publisher with sub-wallet orchestration",
)


@app.on_event("startup")
async def startup():
    global orchestrator, transaction_builder, start_time

    start_time = time.time()

    try:
        orchestrator = UploadOrchestrator(Config.REDIS_URL)
        await orchestrator.connect()

        transaction_builder = TransactionBuilder(
            Config.WALRUS_PACKAGE_ID,
            Config.WALRUS_SYSTEM_OBJECT,
        )

        print(f"✓ Service started on {Config.PLATFORM}")
        print(f"✓ Walrus: {Config.WALRUS_PUBLISHER_URL}")
        print(f"✓ Redis: {Config.REDIS_URL}")

    except Exception as e:
        print(f"✗ Startup failed: {e}")
        raise


@app.on_event("shutdown")
async def shutdown():
    global orchestrator

    if orchestrator:
        await orchestrator.disconnect()
    print("✓ Service shutdown complete")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    uptime = time.time() - start_time
    active_sessions = len(orchestrator.sessions)

    return HealthResponse(
        status="ok",
        version=Config.VERSION,
        platform=Config.PLATFORM,
        uptime_seconds=uptime,
        active_sessions=active_sessions,
    )


@app.post("/upload/init", response_model=UploadInitResponse)
async def init_upload(request: UploadInitRequest):
    try:
        if request.file_size <= 0:
            raise HTTPException(400, "File size must be positive")

        session_id, chunk_plans = await orchestrator.create_upload_session(request.file_size)

        return UploadInitResponse(
            session_id=session_id,
            chunk_count=len(chunk_plans),
            wallet_count=len(set(plan.wallet_address for plan in chunk_plans)),
            chunks=chunk_plans,
        )

    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Upload initialization failed: {str(e)}")


@app.post("/upload/{session_id}/chunk/{chunk_index}", response_model=ChunkUploadResponse)
async def upload_chunk(
    session_id: str,
    chunk_index: int,
    file: UploadFile = File(...),
):
    try:
        session = await orchestrator.get_session(session_id)
        if not session:
            raise HTTPException(404, f"Session {session_id} not found")

        chunk_data = await file.read()
        chunk_size = len(chunk_data)

        async with WalrusUploader() as uploader:
            blob_id = await uploader.upload_chunk(chunk_data, chunk_index)
            await orchestrator.record_chunk_upload(session_id, chunk_index, blob_id)

            return ChunkUploadResponse(
                blob_id=blob_id,
                chunk_index=chunk_index,
                size_bytes=chunk_size,
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Chunk upload failed: {str(e)}")


@app.get("/upload/{session_id}/transactions", response_model=TransactionsResponse)
async def get_transactions(session_id: str):
    try:
        session = await orchestrator.get_session(session_id)
        if not session:
            raise HTTPException(404, f"Session {session_id} not found")

        if session.chunks_uploaded != len(session.chunks):
            raise HTTPException(
                400,
                "Not all chunks uploaded yet. "
                f"Expected {len(session.chunks)}, got {session.chunks_uploaded}",
            )

        transactions = []
        for chunk_index, blob_id in session.blob_ids.items():
            wallet = await orchestrator.get_wallet_for_chunk(session_id, chunk_index)
            if not wallet:
                raise HTTPException(500, f"Wallet not found for chunk {chunk_index}")

            tx_bytes = transaction_builder.build_register_blob_transaction(
                blob_id,
                wallet.address,
            )

            transactions.append(
                UnsignedTransaction(
                    tx_bytes=tx_bytes,
                    sub_wallet_address=wallet.address,
                    blob_id=blob_id,
                    chunk_index=chunk_index,
                )
            )

        return TransactionsResponse(
            session_id=session_id,
            transactions=transactions,
            sponsor_address="0x0",  # Will be set by browser wallet
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Transaction generation failed: {str(e)}")


@app.post("/upload/{session_id}/finalize", response_model=FinalizeResponse)
async def finalize_upload(session_id: str, request: FinalizeRequest):
    try:
        session = await orchestrator.get_session(session_id)
        if not session:
            raise HTTPException(404, f"Session {session_id} not found")

        if not request.signed_transactions:
            raise HTTPException(400, "No transactions to submit")

        for tx in request.signed_transactions:
            await orchestrator.record_transaction_submitted(session_id)

        transaction_digests = [
            tx.digest or f"0x{i:064x}" for i, tx in enumerate(request.signed_transactions)
        ]

        return FinalizeResponse(
            session_id=session_id,
            transaction_digests=transaction_digests,
            status="submitted",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Transaction finalization failed: {str(e)}")


@app.get("/upload/{session_id}/status")
async def get_upload_status(session_id: str):
    import json

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                status = await orchestrator.get_upload_status(session_id)
                if not status:
                    yield f"data: {{'error': 'Session not found'}}\n\n"
                    break

                yield f"data: {json.dumps(status.dict())}\n\n"

                if status.status in ("completed", "failed"):
                    break

                await asyncio.sleep(1)

        except Exception as e:
            yield f"data: {{'error': '{str(e)}'}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@app.get("/metrics")
async def get_metrics():
    uptime = time.time() - start_time
    active_sessions = len(orchestrator.sessions)

    metrics = f"""# HELP walrus_uploader_uptime_seconds Uptime in seconds
# TYPE walrus_uploader_uptime_seconds gauge
walrus_uploader_uptime_seconds {uptime}

# HELP walrus_uploader_active_sessions Active upload sessions
# TYPE walrus_uploader_active_sessions gauge
walrus_uploader_active_sessions {active_sessions}

# HELP walrus_uploader_version Service version
# TYPE walrus_uploader_version gauge
walrus_uploader_version{{version="{Config.VERSION}"}} 1
"""

    return metrics


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=Config.HOST,
        port=Config.PORT,
        log_level="info",
    )
