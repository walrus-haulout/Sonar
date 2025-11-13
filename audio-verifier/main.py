"""
SONAR Audio Verifier Service
FastAPI server for comprehensive audio verification including quality, copyright, transcription, and AI analysis
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Request, Depends, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os
import uuid
import json
import logging
import tempfile
from typing import Dict, Any, Optional

from audio_checker import AudioQualityChecker
from fingerprint import CopyrightDetector
from sui_client import SuiVerificationClient
from verification_pipeline import VerificationPipeline

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
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
VERIFIER_AUTH_TOKEN = os.getenv("VERIFIER_AUTH_TOKEN")
MAX_FILE_SIZE_GB = int(os.getenv("MAX_FILE_SIZE_GB", "13"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024**3

# Sui blockchain configuration
SUI_NETWORK = os.getenv("SUI_NETWORK", "testnet")
SUI_VALIDATOR_KEY = os.getenv("SUI_VALIDATOR_KEY")
SUI_PACKAGE_ID = os.getenv("SUI_PACKAGE_ID")
SUI_SESSION_REGISTRY_ID = os.getenv("SUI_SESSION_REGISTRY_ID")
SUI_VALIDATOR_CAP_ID = os.getenv("SUI_VALIDATOR_CAP_ID")

# Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# AcoustID API configuration
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY")

# Walrus plaintext upload configuration
WALRUS_UPLOAD_URL = os.getenv("WALRUS_UPLOAD_URL")
WALRUS_UPLOAD_TOKEN = os.getenv("WALRUS_UPLOAD_TOKEN")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY must be set for audio transcription and analysis")

if not ACOUSTID_API_KEY:
    raise RuntimeError("ACOUSTID_API_KEY must be set for copyright detection")

if not VERIFIER_AUTH_TOKEN:
    raise RuntimeError("VERIFIER_AUTH_TOKEN must be set for authenticated access")

if not all([SUI_VALIDATOR_KEY, SUI_PACKAGE_ID, SUI_SESSION_REGISTRY_ID, SUI_VALIDATOR_CAP_ID]):
    raise RuntimeError(
        "Sui blockchain configuration missing; set SUI_VALIDATOR_KEY, "
        "SUI_PACKAGE_ID, SUI_SESSION_REGISTRY_ID, and SUI_VALIDATOR_CAP_ID"
    )

if not WALRUS_UPLOAD_URL:
    raise RuntimeError("WALRUS_UPLOAD_URL must be set for plaintext storage")
# CORS middleware - explicit origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# Initialize clients (lazy initialization to avoid startup errors)
_sui_client: Optional[SuiVerificationClient] = None
_verification_pipeline: Optional[VerificationPipeline] = None
_quality_checker = AudioQualityChecker()
_copyright_detector = CopyrightDetector(ACOUSTID_API_KEY)


def get_sui_client() -> SuiVerificationClient:
    """Get or create Sui blockchain client instance."""
    global _sui_client
    if _sui_client is None:
        if not all([SUI_VALIDATOR_KEY, SUI_PACKAGE_ID, SUI_SESSION_REGISTRY_ID, SUI_VALIDATOR_CAP_ID]):
            raise HTTPException(
                status_code=500,
                detail="Sui blockchain not configured (SUI_VALIDATOR_KEY, SUI_PACKAGE_ID, SUI_SESSION_REGISTRY_ID, SUI_VALIDATOR_CAP_ID required)"
            )
        _sui_client = SuiVerificationClient(
            network=SUI_NETWORK,
            validator_keystring=SUI_VALIDATOR_KEY,
            package_id=SUI_PACKAGE_ID,
            session_registry_id=SUI_SESSION_REGISTRY_ID,
            validator_cap_id=SUI_VALIDATOR_CAP_ID
        )
        logger.info(f"Initialized Sui client for {SUI_NETWORK} network")
    return _sui_client


def get_verification_pipeline() -> VerificationPipeline:
    """Get or create verification pipeline instance."""
    global _verification_pipeline
    if _verification_pipeline is None:
        if not GEMINI_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="Gemini API not configured (GEMINI_API_KEY required)"
            )
        sui_client = get_sui_client()
        _verification_pipeline = VerificationPipeline(
            sui_client,
            GEMINI_API_KEY,
            ACOUSTID_API_KEY
        )
        logger.info("Initialized verification pipeline with Sui blockchain backend")
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
            "AI transcription (Gemini)",
            "Content safety analysis (Gemini)"
        ]
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    config_status = {
        "sui_configured": True,
        "gemini_configured": bool(GEMINI_API_KEY),
        "acoustid_configured": bool(ACOUSTID_API_KEY),
        "walrus_configured": bool(WALRUS_UPLOAD_URL),
        "auth_enabled": bool(VERIFIER_AUTH_TOKEN)
    }
    return {
        "status": "healthy",
        "config": config_status
    }


# New verification endpoints (integrated pipeline)
@app.post("/verify", dependencies=[Depends(verify_bearer_token)])
async def create_verification(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    metadata: str = Form(...)
):
    """
    Start comprehensive audio verification.

    Accepts:
    - file: Raw audio file (before encryption)
    - metadata: JSON string with dataset metadata

    Returns:
    - sessionObjectId: On-chain verification session ID for polling
    - estimatedTimeSeconds: Estimated completion time
    """
    temp_file_path = None
    session_object_id: Optional[str] = None

    try:
        # Parse metadata
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid metadata JSON")

        # Generate verification ID
        verification_id = str(uuid.uuid4())

        # Stream upload to temp file to avoid loading entire file into RAM
        # Critical for large files (up to 13GB)
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

        logger.info(f"Creating verification {verification_id} for file: {file.filename} ({file_size} bytes)")

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

        # Upload plaintext audio to Walrus before verification
        plaintext_cid = await upload_plaintext_to_walrus(
            temp_file_path,
            {
                "filename": file.filename,
                "contentType": file.content_type,
                "metadata": metadata_dict.get("metadata"),
            }
        )

        # Create on-chain verification session
        sui_client = get_sui_client()
        session_object_id = await sui_client.create_session(verification_id, {
            "plaintext_cid": plaintext_cid,
            "plaintext_size_bytes": file_size,
            "duration_seconds": int(duration_seconds),
            "file_format": file.content_type or "audio/wav"
        })

        if not session_object_id:
            os.unlink(temp_file_path)
            raise HTTPException(
                status_code=500,
                detail="Failed to create on-chain verification session"
            )

        logger.info(f"Created on-chain session: {session_object_id}")

        # Start background verification pipeline with session object ID
        # Pipeline will read from disk and clean up the file when done
        pipeline = get_verification_pipeline()
        background_tasks.add_task(
            pipeline.run_from_file,
            session_object_id,  # Pass object ID instead of UUID
            temp_file_path,
            metadata_dict
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


@app.get("/verify/{session_object_id}", dependencies=[Depends(verify_bearer_token)])
async def get_verification_status(session_object_id: str):
    """
    Get verification status from blockchain.

    Returns VerificationSession data from on-chain object.

    Args:
        session_object_id: On-chain VerificationSession object ID

    Returns:
        Session data with state and stage information
    """
    try:
        sui_client = get_sui_client()
        session = await sui_client.get_session(session_object_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found on blockchain")

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
    as failed on blockchain. The pipeline may continue running until it checks
    the session state.
    """
    try:
        sui_client = get_sui_client()
        session = await sui_client.get_session(session_object_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Mark as failed on blockchain (cancelled)
        await sui_client.mark_failed(session_object_id, {
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
