"""
SONAR Audio Verifier Service
FastAPI server for comprehensive audio verification including quality, copyright, transcription, and AI analysis
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Request, Depends, BackgroundTasks, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import httpx
import os
import uuid
import json
import logging
import tempfile
import asyncio
from typing import Dict, Any, Optional, List

from audio_checker import AudioQualityChecker
from fingerprint import CopyrightDetector
from session_store import SessionStore
from verification_pipeline import VerificationPipeline
from seal_decryptor import decrypt_encrypted_blob

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SONAR Audio Verifier",
    description="Comprehensive audio verification: quality, copyright, transcription, and AI analysis",
    version="2.0.0"
)

# Environment configuration
# CORS origins - standardized to CORS_ORIGIN (matches backend naming)
# Supports backwards compatibility with ALLOWED_ORIGINS
CORS_ORIGIN = os.getenv("CORS_ORIGIN") or os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGIN.split(",")]
VERIFIER_AUTH_TOKEN = os.getenv("VERIFIER_AUTH_TOKEN")
MAX_FILE_SIZE_GB = int(os.getenv("MAX_FILE_SIZE_GB", "13"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024**3

# PostgreSQL configuration (for session storage, same database as backend)
DATABASE_URL = os.getenv("DATABASE_URL")

# OpenRouter API configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# AcoustID API configuration
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY")

# Walrus configuration
WALRUS_UPLOAD_URL = os.getenv("WALRUS_UPLOAD_URL")  # Legacy: plaintext upload
WALRUS_UPLOAD_TOKEN = os.getenv("WALRUS_UPLOAD_TOKEN")
WALRUS_AGGREGATOR_URL = os.getenv("WALRUS_AGGREGATOR_URL")  # New: for fetching encrypted blobs
WALRUS_AGGREGATOR_TOKEN = os.getenv("WALRUS_AGGREGATOR_TOKEN")  # Optional bearer token

# Seal decryption configuration
SEAL_PACKAGE_ID = os.getenv("SEAL_PACKAGE_ID")

# Feature flag for legacy upload support
ENABLE_LEGACY_UPLOAD = os.getenv("ENABLE_LEGACY_UPLOAD", "false").lower() == "true"


# Validate Seal configuration (required for encrypted blob flow)
if not SEAL_PACKAGE_ID:
    logger.warning("SEAL_PACKAGE_ID not set - encrypted blob verification will be disabled")
if not WALRUS_AGGREGATOR_URL:
    logger.warning("WALRUS_AGGREGATOR_URL not set - encrypted blob verification will be disabled")

# Legacy plaintext upload (deprecated but kept for backwards compatibility)
if not WALRUS_UPLOAD_URL and not ENABLE_LEGACY_UPLOAD:
    logger.warning("WALRUS_UPLOAD_URL not set - legacy plaintext upload disabled")
# CORS middleware - explicit origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# Startup validation: Check required environment variables at application startup
@app.on_event("startup")
async def validate_environment():
    """
    Validate required environment variables at application startup.

    This validation runs when the application starts, not at import time.
    This allows the module to be imported during build verification without
    requiring environment variables.
    """
    missing = []

    if not OPENROUTER_API_KEY:
        missing.append("OPENROUTER_API_KEY (required for audio transcription and analysis)")

    if not ACOUSTID_API_KEY:
        missing.append("ACOUSTID_API_KEY (required for copyright detection)")

    if not VERIFIER_AUTH_TOKEN:
        missing.append("VERIFIER_AUTH_TOKEN (required for authenticated access)")

    if not DATABASE_URL:
        missing.append("DATABASE_URL (required for session storage - Railway provides this automatically)")

    if missing:
        error_msg = "Missing required environment variables:\n  - " + "\n  - ".join(missing)
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    logger.info("Environment validation passed: all required variables configured")


# Initialize clients (lazy initialization to avoid startup errors)
_session_store: Optional[SessionStore] = None
_verification_pipeline: Optional[VerificationPipeline] = None
_quality_checker = AudioQualityChecker()
_copyright_detector = CopyrightDetector(ACOUSTID_API_KEY)


def get_session_store() -> SessionStore:
    """Get or create session store instance."""
    global _session_store
    if _session_store is None:
        _session_store = SessionStore()
        logger.info("Initialized PostgreSQL session store")
    return _session_store


def get_verification_pipeline() -> VerificationPipeline:
    """Get or create verification pipeline instance."""
    global _verification_pipeline
    if _verification_pipeline is None:
        if not OPENROUTER_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="OpenRouter API not configured (OPENROUTER_API_KEY required)"
            )
        session_store = get_session_store()
        _verification_pipeline = VerificationPipeline(
            session_store,
            OPENROUTER_API_KEY,
            ACOUSTID_API_KEY
        )
        logger.info("Initialized verification pipeline with PostgreSQL backend")
    return _verification_pipeline


async def upload_plaintext_to_walrus(file_path: str, metadata: Dict[str, Any]) -> str:
    """
    Upload plaintext audio to Walrus and return the resulting blob ID.

    Raises HTTP 503 if Walrus configuration is missing, or HTTP 502 if the upload fails.
    """
    if not WALRUS_UPLOAD_URL:
        raise HTTPException(
            status_code=503,
            detail="Walrus upload not configured (set WALRUS_UPLOAD_URL and optional WALRUS_UPLOAD_TOKEN)"
        )

    headers = {}
    if WALRUS_UPLOAD_TOKEN:
        headers["Authorization"] = f"Bearer {WALRUS_UPLOAD_TOKEN}"

    # Keep payload minimal while still providing context for downstream services
    metadata_payload = metadata.get("metadata") if isinstance(metadata, dict) else None
    if metadata_payload is None:
        metadata_payload = metadata

    form_payload = {
        "filename": os.path.basename(file_path),
        "metadata": json.dumps(metadata_payload or {}),
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(file_path, "rb") as file_handle:
                files = {
                    "file": (os.path.basename(file_path), file_handle, "application/octet-stream")
                }
                response = await client.post(
                    WALRUS_UPLOAD_URL,
                    data=form_payload,
                    files=files,
                    headers=headers,
                )
        response.raise_for_status()
        payload = response.json()
        blob_id = payload.get("blob_id") or payload.get("blobId") or payload.get("id")
        if not blob_id:
            raise ValueError("Walrus response missing blob identifier")
        return str(blob_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Walrus upload failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"Walrus upload failed: {exc}"
        ) from exc


# Size limit middleware - runs BEFORE multipart parsing
@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    """
    Check content-length before parsing to prevent large uploads.
    IMPORTANT: This runs before Starlette's FormParser to avoid memory issues.
    """
    if request.method == "POST" and "/verify" in request.url.path:
        content_length = request.headers.get("content-length")
        if content_length:
            if int(content_length) > MAX_FILE_SIZE_BYTES:
                logger.warning(f"Upload too large: {content_length} bytes (max {MAX_FILE_SIZE_BYTES})")
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"File exceeds {MAX_FILE_SIZE_GB}GB limit"}
                )
    return await call_next(request)


# Pydantic models for API requests
class EncryptedVerificationRequest(BaseModel):
    """Request model for encrypted blob verification."""
    walrusBlobId: str = Field(..., description="Walrus blob ID of encrypted audio")
    sealIdentity: str = Field(..., description="Seal identity (hex string) used for encryption")
    encryptedObjectBcsHex: str = Field(..., description="BCS-serialized encrypted object (hex)")
    metadata: Dict[str, Any] = Field(..., description="Dataset metadata")
    sessionKeyData: Optional[str] = Field(None, description="Exported SessionKey from frontend for user-authorized decryption")

    class Config:
        # Accept both camelCase and snake_case for sessionKeyData
        populate_by_name = True


# Auth dependency for /verify endpoints
async def verify_bearer_token(authorization: str = Header(None)):
    """
    Verify bearer token for verification endpoints.
    Skips auth check if VERIFIER_AUTH_TOKEN is not set (development mode).
    """
    expected = f"Bearer {VERIFIER_AUTH_TOKEN}"
    if authorization != expected:
        logger.warning(f"Invalid auth token: {authorization}")
        raise HTTPException(status_code=401, detail="Invalid or missing authorization token")


# Health check endpoints
@app.get("/")
async def root():
    """Service info endpoint"""
    return {
        "service": "SONAR Audio Verifier",
        "version": "2.0.0",
        "status": "healthy",
        "features": [
            "Audio quality analysis",
            "Copyright detection (Chromaprint/AcoustID)",
            "AI transcription (Whisper via OpenRouter)",
            "Content safety analysis (Gemini via OpenRouter)"
        ]
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    # Test database connection
    db_connected = False
    if DATABASE_URL:
        try:
            session_store = get_session_store()
            # Try to get pool (will create table if needed)
            await session_store._get_pool()
            db_connected = True
        except Exception as e:
            logger.warning(f"Database connection test failed: {e}")
    
    config_status = {
        "database_configured": bool(DATABASE_URL),
        "database_connected": db_connected,
        "openrouter_configured": bool(OPENROUTER_API_KEY),
        "acoustid_configured": bool(ACOUSTID_API_KEY),
        "walrus_upload_configured": bool(WALRUS_UPLOAD_URL),  # Legacy
        "walrus_aggregator_configured": bool(WALRUS_AGGREGATOR_URL),  # New
        "seal_configured": bool(SEAL_PACKAGE_ID),
        "auth_enabled": bool(VERIFIER_AUTH_TOKEN)
    }
    return {
        "status": "healthy",
        "config": config_status
    }


# New verification endpoints (integrated pipeline)
@app.post("/verify", dependencies=[Depends(verify_bearer_token)])
async def create_verification(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Start comprehensive audio verification.

    Accepts two request formats:
    1. JSON (encrypted blob flow):
       - walrusBlobId: Walrus blob ID
       - sealIdentity: Seal identity (hex)
       - encryptedObjectBcsHex: BCS-serialized encrypted object (hex)
       - metadata: Dataset metadata dict

    2. FormData (legacy flow, requires ENABLE_LEGACY_UPLOAD=true):
       - file: Raw audio file
       - metadata: JSON string with dataset metadata

    Returns:
    - sessionObjectId: Verification session ID (UUID) for polling
    - estimatedTimeSeconds: Estimated completion time
    """
    temp_file_path = None
    session_object_id: Optional[str] = None

    try:
        # Determine request type based on content type
        content_type = request.headers.get("content-type", "")
        is_json_request = content_type.startswith("application/json")

        if is_json_request:
            # New encrypted blob flow - parse JSON body
            try:
                body_data = await request.json()
                encrypted_request = EncryptedVerificationRequest(**body_data)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid JSON request: {str(e)}")

            if not WALRUS_AGGREGATOR_URL:
                raise HTTPException(
                    status_code=503,
                    detail="WALRUS_AGGREGATOR_URL not configured - encrypted blob verification disabled"
                )
            if not SEAL_PACKAGE_ID:
                raise HTTPException(
                    status_code=503,
                    detail="Seal decryption not configured - missing SEAL_PACKAGE_ID"
                )

            verification_id = str(uuid.uuid4())
            metadata_dict = encrypted_request.metadata

            logger.info(
                f"Creating encrypted verification {verification_id} for blob {encrypted_request.walrusBlobId[:16]}..."
            )

            # Decrypt encrypted blob to temp file
            try:
                # Convert hex to bytes for decryptor
                encrypted_object_bytes = bytes.fromhex(encrypted_request.encryptedObjectBcsHex)

                # Decrypt blob (runs in thread pool to avoid blocking)
                plaintext_bytes = await decrypt_encrypted_blob(
                    encrypted_request.walrusBlobId,
                    encrypted_object_bytes,
                    encrypted_request.sealIdentity,
                    encrypted_request.sessionKeyData
                )

                # Write decrypted data to temp file
                temp_dir = "/tmp/audio-verifier" if os.path.exists("/tmp/audio-verifier") else tempfile.gettempdir()
                temp_fd, temp_file_path = tempfile.mkstemp(
                    suffix=".wav",  # Default to .wav, will be detected by soundfile
                    prefix=f"decrypted_{verification_id}_",
                    dir=temp_dir
                )

                with os.fdopen(temp_fd, 'wb') as temp_file:
                    temp_file.write(plaintext_bytes)

                file_size = len(plaintext_bytes)
                logger.info(f"Decrypted {file_size} bytes to {temp_file_path}")

            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid encrypted blob data: {str(e)}")
            except RuntimeError as e:
                logger.error(f"Decryption failed: {e}", exc_info=True)
                raise HTTPException(status_code=502, detail=f"Failed to decrypt encrypted blob: {str(e)}")

            # Get audio duration from decrypted file
            try:
                import soundfile as sf
                with sf.SoundFile(temp_file_path) as sf_file:
                    frames = len(sf_file)
                    duration_seconds = frames / float(sf_file.samplerate) if sf_file.samplerate else 0.0
                logger.info(f"Audio duration: {duration_seconds:.2f}s")
            except Exception as e:
                logger.warning(f"Failed to extract audio duration: {e}")
                duration_seconds = 0

            # Create verification session in PostgreSQL
            session_store = get_session_store()
            session_object_id = await session_store.create_session(verification_id, {
                "encrypted_cid": encrypted_request.walrusBlobId,  # Store encrypted blob ID
                "plaintext_size_bytes": file_size,
                "duration_seconds": int(duration_seconds),
                "file_format": "audio/wav"  # Default, will be detected during verification
            })

            logger.info(f"Created session: {session_object_id}")

            # Start background verification pipeline in thread pool to avoid blocking event loop
            pipeline = get_verification_pipeline()
            asyncio.create_task(
                asyncio.to_thread(
                    _run_pipeline_sync,
                    pipeline,
                    session_object_id,
                    temp_file_path,
                    metadata_dict
                )
            )

            # Estimate time based on file size (rough estimate: 1MB per second)
            estimated_time = min(60, max(10, file_size / (1024 * 1024)))

            return JSONResponse(content={
                "sessionObjectId": session_object_id,
                "estimatedTimeSeconds": int(estimated_time),
                "status": "processing"
            })

        else:
            # Legacy FormData flow (for backwards compatibility)
            if not ENABLE_LEGACY_UPLOAD:
                raise HTTPException(
                    status_code=400,
                    detail="Legacy file upload disabled. Use encrypted blob flow or set ENABLE_LEGACY_UPLOAD=true"
                )

            if not file or not metadata:
                raise HTTPException(status_code=400, detail="Missing file or metadata in FormData request")

            # Parse metadata
            try:
                metadata_dict = json.loads(metadata)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid metadata JSON")

            verification_id = str(uuid.uuid4())

            # Stream upload to temp file to avoid loading entire file into RAM
            temp_dir = "/tmp/audio-verifier" if os.path.exists("/tmp/audio-verifier") else tempfile.gettempdir()
            temp_fd, temp_file_path = tempfile.mkstemp(
                suffix=os.path.splitext(file.filename or ".tmp")[1],
                prefix=f"verify_{verification_id}_",
                dir=temp_dir
            )

            file_size = 0
            try:
                # Stream file to disk in chunks
                with os.fdopen(temp_fd, 'wb') as temp_file:
                    chunk_size = 1024 * 1024  # 1MB chunks
                    while chunk := await file.read(chunk_size):
                        temp_file.write(chunk)
                        file_size += len(chunk)
            except Exception as e:
                # Clean up temp file on upload error
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
                raise HTTPException(status_code=400, detail=f"Failed to upload file: {str(e)}")

            if file_size == 0:
                os.unlink(temp_file_path)
                raise HTTPException(status_code=400, detail="Empty file uploaded")

            logger.info(f"Creating legacy verification {verification_id} for file: {file.filename} ({file_size} bytes)")

            # Get audio duration from file
            try:
                import soundfile as sf
                with sf.SoundFile(temp_file_path) as sf_file:
                    frames = len(sf_file)
                    duration_seconds = frames / float(sf_file.samplerate) if sf_file.samplerate else 0.0
                logger.info(f"Audio duration: {duration_seconds:.2f}s")
            except Exception as e:
                logger.warning(f"Failed to extract audio duration: {e}")
                duration_seconds = 0

            # Upload plaintext audio to Walrus before verification (legacy flow)
            if not WALRUS_UPLOAD_URL:
                os.unlink(temp_file_path)
                raise HTTPException(
                    status_code=503,
                    detail="WALRUS_UPLOAD_URL not configured for legacy upload flow"
                )

            plaintext_cid = await upload_plaintext_to_walrus(
                temp_file_path,
                {
                    "filename": file.filename,
                    "contentType": file.content_type,
                    "metadata": metadata_dict.get("metadata"),
                }
            )

            # Create verification session in PostgreSQL
            session_store = get_session_store()
            session_object_id = await session_store.create_session(verification_id, {
                "plaintext_cid": plaintext_cid,
                "plaintext_size_bytes": file_size,
                "duration_seconds": int(duration_seconds),
                "file_format": file.content_type or "audio/wav"
            })

            logger.info(f"Created session: {session_object_id}")

            # Start background verification pipeline in thread pool
            pipeline = get_verification_pipeline()
            asyncio.create_task(
                asyncio.to_thread(
                    _run_pipeline_sync,
                    pipeline,
                    session_object_id,
                    temp_file_path,
                    metadata_dict
                )
            )

            # Estimate time based on file size (rough estimate: 1MB per second)
            estimated_time = min(60, max(10, file_size / (1024 * 1024)))

            return JSONResponse(content={
                "sessionObjectId": session_object_id,
                "estimatedTimeSeconds": int(estimated_time),
                "status": "processing"
            })

    except HTTPException as exc:
        # Clean up temp file on HTTP exceptions
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass
        raise
    except Exception as e:
        # Clean up temp file on unexpected errors
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass
        logger.error(f"Failed to start verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start verification: {str(e)}"
        )


def _run_pipeline_sync(
    pipeline: VerificationPipeline,
    session_object_id: str,
    temp_file_path: str,
    metadata_dict: Dict[str, Any]
) -> None:
    """
    Synchronous wrapper for pipeline execution (runs in thread pool).

    This ensures the pipeline doesn't block the FastAPI event loop.
    """
    import asyncio
    # Create new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            pipeline.run_from_file(session_object_id, temp_file_path, metadata_dict)
        )
    finally:
        loop.close()


@app.get("/verify/{session_object_id}", dependencies=[Depends(verify_bearer_token)])
async def get_verification_status(session_object_id: str):
    """
    Get verification status from PostgreSQL.

    Returns verification session data.

    Args:
        session_object_id: Verification session ID (UUID)

    Returns:
        Session data with state and stage information
    """
    try:
        session_store = get_session_store()
        session = await session_store.get_session(session_object_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return JSONResponse(content=session)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session status: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get verification status: {str(e)}"
        )


@app.post("/verify/{session_object_id}/cancel", dependencies=[Depends(verify_bearer_token)])
async def cancel_verification(session_object_id: str):
    """
    Cancel a running verification.

    Note: Due to BackgroundTasks limitations, this only marks the session
    as cancelled in KV. The pipeline may continue running until it checks
    the session state.
    """
    try:
        session_store = get_session_store()
        session = await session_store.get_session(session_object_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Mark as cancelled in PostgreSQL
        await session_store.mark_failed(session_object_id, {
            "errors": ["Verification cancelled by user"],
            "cancelled": True
        })

        return JSONResponse(content={
            "sessionObjectId": session_object_id,
            "status": "cancelled"
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel verification: {str(e)}"
        )


# Legacy endpoints (kept for backward compatibility)
@app.post("/check-audio")
async def check_audio(file: UploadFile = File(...)):
    """
    Legacy endpoint: Check audio quality and copyright only.

    For new integrations, use POST /verify instead.
    """
    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        # Run quality checks
        quality_result = await _quality_checker.check_audio(audio_bytes)

        # Run copyright detection
        copyright_result = await _copyright_detector.check_copyright(audio_bytes)

        # Combine results
        quality = quality_result.get("quality", {})
        copyright_info = copyright_result.get("copyright", {})

        # Determine overall approval
        quality_passed = quality.get("passed", False) if quality else False
        copyright_passed = copyright_info.get("passed", True)
        approved = quality_passed and copyright_passed

        # Build response
        response = {
            "approved": approved,
            "quality": quality,
            "copyright": copyright_info,
            "errors": []
        }

        # Add quality errors
        if "errors" in quality_result:
            response["errors"].extend(quality_result["errors"])

        # Add copyright warning
        if copyright_info.get("detected"):
            matches = copyright_info.get("matches", [])
            if matches:
                match_str = ", ".join([
                    f"{m['title']} by {m['artist']}" for m in matches[:3]
                ])
                response["errors"].append(f"Copyright detected: {match_str}")
            else:
                response["errors"].append("Copyrighted content detected")

        return JSONResponse(content=response)

    except Exception as e:
        logger.error(f"Legacy check-audio failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process audio: {str(e)}"
        )


@app.post("/check-audio-url")
async def check_audio_url(url: str):
    """
    Legacy endpoint: Check audio from URL (e.g., Walrus blob).

    For new integrations, use POST /verify instead.
    """
    try:
        # Download audio from URL
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=30.0)
            response.raise_for_status()
            audio_bytes = response.content

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty file from URL")

        # Run quality checks
        quality_result = await _quality_checker.check_audio(audio_bytes)

        # Run copyright detection
        copyright_result = await _copyright_detector.check_copyright(audio_bytes)

        # Combine results
        quality = quality_result.get("quality", {})
        copyright_info = copyright_result.get("copyright", {})

        quality_passed = quality.get("passed", False) if quality else False
        copyright_passed = copyright_info.get("passed", True)
        approved = quality_passed and copyright_passed

        response = {
            "approved": approved,
            "quality": quality,
            "copyright": copyright_info,
            "errors": []
        }

        if "errors" in quality_result:
            response["errors"].extend(quality_result["errors"])

        if copyright_info.get("detected"):
            matches = copyright_info.get("matches", [])
            if matches:
                match_str = ", ".join([
                    f"{m['title']} by {m['artist']}" for m in matches[:3]
                ])
                response["errors"].append(f"Copyright detected: {match_str}")
            else:
                response["errors"].append("Copyrighted content detected")

        return JSONResponse(content=response)

    except httpx.HTTPError as e:
        logger.error(f"Failed to download from URL: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download audio from URL: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Legacy check-audio-url failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process audio: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
