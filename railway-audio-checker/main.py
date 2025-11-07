"""
SONAR Audio Checker Service
FastAPI server for audio quality and copyright detection
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os
from typing import Dict, Any

from audio_checker import AudioQualityChecker
from fingerprint import CopyrightDetector

# Initialize FastAPI app
app = FastAPI(
    title="SONAR Audio Checker",
    description="Audio quality and copyright detection service",
    version="1.0.0"
)

# CORS middleware for Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
        "https://projectsonar.xyz",
        "https://*.projectsonar.xyz"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize checkers
quality_checker = AudioQualityChecker()
copyright_detector = CopyrightDetector(
    acoustid_api_key=os.getenv("ACOUSTID_API_KEY")
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "SONAR Audio Checker",
        "version": "1.0.0",
        "status": "healthy"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/check-audio")
async def check_audio(file: UploadFile = File(...)):
    """
    Check audio quality and copyright

    Args:
        file: Audio file upload

    Returns:
        JSON with quality metrics, copyright detection, and approval status
    """
    try:
        # Read file bytes
        audio_bytes = await file.read()

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        # Run quality checks
        quality_result = await quality_checker.check_audio(audio_bytes)

        # Run copyright detection
        copyright_result = await copyright_detector.check_copyright(audio_bytes)

        # Combine results
        quality = quality_result.get("quality", {})
        copyright_info = copyright_result.get("copyright", {})

        # Determine overall approval
        quality_passed = quality.get("passed", False) if quality else False
        copyright_passed = copyright_info.get("passed", True)  # Default true if check skipped
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

        # Add copyright error
        if copyright_info.get("detected"):
            matches = copyright_info.get("matches", [])
            if matches:
                match_str = ", ".join([
                    f"{m['title']} by {m['artist']}" for m in matches[:3]
                ])
                response["errors"].append(
                    f"Copyright detected: {match_str}"
                )
            else:
                response["errors"].append("Copyrighted content detected")

        return JSONResponse(content=response)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process audio: {str(e)}"
        )


@app.post("/check-audio-url")
async def check_audio_url(url: str):
    """
    Check audio from URL (e.g., Walrus blob)

    Args:
        url: URL to audio file

    Returns:
        JSON with quality metrics, copyright detection, and approval status
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
        quality_result = await quality_checker.check_audio(audio_bytes)

        # Run copyright detection
        copyright_result = await copyright_detector.check_copyright(audio_bytes)

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

        # Add copyright error
        if copyright_info.get("detected"):
            matches = copyright_info.get("matches", [])
            if matches:
                match_str = ", ".join([
                    f"{m['title']} by {m['artist']}" for m in matches[:3]
                ])
                response["errors"].append(
                    f"Copyright detected: {match_str}"
                )
            else:
                response["errors"].append("Copyrighted content detected")

        return JSONResponse(content=response)

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download audio from URL: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process audio: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
