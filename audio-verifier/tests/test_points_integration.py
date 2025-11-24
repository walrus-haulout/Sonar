"""
Integration test for end-to-end points flow.

Tests that points are calculated and awarded after successful verification,
without requiring OpenRouter/AcoustID API keys (uses mocks).
"""

import pytest
import asyncio
import os
import json
from unittest.mock import Mock, AsyncMock, patch
from pathlib import Path

# Set test environment variables before imports
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", "postgresql://localhost:5432/sonar_test"
)
os.environ["OPENROUTER_API_KEY"] = "test_key"
os.environ["ACOUSTID_API_KEY"] = "test_key"

from verification_pipeline import VerificationPipeline
from session_store import SessionStore
from user_manager import UserManager
from points_calculator import PointsCalculator


@pytest.fixture
def test_wallet():
    """Test wallet address."""
    return "0x" + "1234567890abcdef" * 4  # Valid 66-char address


@pytest.fixture
def mock_quality_result():
    """Mock quality check result."""
    return {
        "quality": {
            "passed": True,
            "duration": 120.0,
            "sample_rate": 44100,
            "channels": 2,
            "bit_depth": 16,
            "clipping_detected": False,
            "silence_detected": False,
            "volume_ok": True,
            "score": 85,
        },
        "errors": [],
        "warnings": [],
    }


@pytest.fixture
def mock_copyright_result():
    """Mock copyright check result."""
    return {
        "copyright": {
            "detected": False,
            "confidence": 0.0,
            "matches": [],
            "passed": True,
        },
        "errors": [],
    }


@pytest.fixture
def mock_analysis_result():
    """Mock AI analysis result with all required fields."""
    return {
        "qualityScore": 0.85,  # 0-1 scale
        "rarityScore": 75,  # 0-100 scale
        "suggestedPrice": 5.0,
        "safetyPassed": True,
        "subjectRarityTier": "High",
        "specificityGrade": "B",
        "insights": [
            "High-quality audio recording",
            "Rare subject matter",
            "Well-documented dataset",
        ],
        "concerns": [],
        "recommendations": {},
        "overallSummary": "Excellent dataset with rare content",
        "detectedLanguages": ["en"],
        "qualityAnalysis": {
            "clarity": {"score": 0.9, "reasoning": "Clear audio"},
            "contentValue": {"score": 0.8, "reasoning": "Valuable content"},
            "metadataAccuracy": {"score": 0.85, "reasoning": "Accurate metadata"},
            "completeness": {"score": 0.8, "reasoning": "Complete recording"},
        },
        "priceAnalysis": {
            "basePrice": 3.0,
            "qualityMultiplier": 1.4,
            "rarityMultiplier": 1.2,
            "finalPrice": 5.0,
            "breakdown": "Base 3 SUI × quality 1.4 × rarity 1.2 = 5.0 SUI",
        },
    }


@pytest.mark.asyncio
async def test_points_awarded_on_approved_verification(
    test_wallet, mock_quality_result, mock_copyright_result, mock_analysis_result
):
    """
    Test that points are calculated and awarded after successful verification.

    This test mocks all external API calls to avoid requiring real API keys.
    """
    # Setup
    session_store = SessionStore()
    user_manager = UserManager()
    pipeline = VerificationPipeline(
        session_store, "test_openrouter_key", "test_acoustid_key"
    )

    # Create test metadata
    metadata = {
        "walletAddress": test_wallet,
        "title": "Test Audio Dataset",
        "description": "Integration test submission",
        "sampleCount": 1,
        "languages": ["en"],
        "tags": ["test", "integration"],
    }

    # Create test session
    session_id = await session_store.create_session(
        "test_verification_id",
        {"metadata": metadata, "file_format": "audio/wav", "duration_seconds": 120},
    )

    try:
        # Mock the pipeline's internal methods to avoid API calls
        pipeline.quality_checker.check_audio_file = AsyncMock(
            return_value=mock_quality_result
        )
        pipeline.copyright_detector.check_copyright_from_path = AsyncMock(
            return_value=mock_copyright_result
        )

        # Mock transcription - returns tuple but pipeline expects it
        with patch.object(
            pipeline, "_stage_transcription", new_callable=AsyncMock
        ) as mock_trans:
            mock_trans.return_value = ("Test transcript content", ["en"])

            # Mock analysis
            with patch.object(
                pipeline, "_stage_analysis", new_callable=AsyncMock
            ) as mock_ai:
                mock_ai.return_value = mock_analysis_result

        # Create a temporary audio file for testing
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            # Write minimal valid WAV header
            f.write(b"RIFF")
            f.write((36).to_bytes(4, "little"))
            f.write(b"WAVE")
            f.write(b"fmt ")
            f.write((16).to_bytes(4, "little"))
            f.write((1).to_bytes(2, "little"))  # PCM
            f.write((2).to_bytes(2, "little"))  # Channels
            f.write((44100).to_bytes(4, "little"))  # Sample rate
            f.write((176400).to_bytes(4, "little"))  # Byte rate
            f.write((4).to_bytes(2, "little"))  # Block align
            f.write((16).to_bytes(2, "little"))  # Bits per sample
            f.write(b"data")
            f.write((0).to_bytes(4, "little"))  # Data size
            temp_audio_path = f.name

        try:
            # Run the pipeline
            await pipeline.run_from_file(session_id, temp_audio_path, metadata)

            # Assert session has points
            session = await session_store.get_session(session_id)
            assert session is not None, "Session should exist"
            assert session["status"] == "completed", (
                f"Session should be completed, got: {session['status']}"
            )

            # Check points were awarded
            points_awarded = session.get("points_awarded")
            assert points_awarded is not None, "points_awarded should be set"
            assert points_awarded > 0, (
                f"Points should be awarded, got: {points_awarded}"
            )

            # Check points breakdown is stored
            points_breakdown = session.get("points_breakdown")
            assert points_breakdown is not None, "points_breakdown should be stored"
            assert "quality_multiplier" in points_breakdown, (
                "Should have quality multiplier"
            )
            assert "total_multiplier" in points_breakdown, (
                "Should have total multiplier"
            )

            # Assert user record created
            user = await user_manager.get_user_by_wallet(test_wallet)
            assert user is not None, "User should be created"
            assert user["total_points"] > 0, (
                f"User should have points, got: {user['total_points']}"
            )
            assert user["total_submissions"] == 1, (
                f"Submission count should be 1, got: {user['total_submissions']}"
            )
            assert user["tier"] in ["Contributor", "Bronze", "Silver"], (
                f"Tier should be set, got: {user['tier']}"
            )

            # Assert user_submissions record exists
            pool = await session_store._get_pool()
            async with pool.acquire() as conn:
                submission = await conn.fetchrow(
                    "SELECT * FROM user_submissions WHERE verification_session_id = $1",
                    session_id,
                )
                assert submission is not None, "user_submissions record should exist"
                assert submission["points_earned"] == points_awarded, (
                    "Submission points should match"
                )
                assert submission["wallet_address"] == test_wallet, (
                    "Wallet address should match"
                )

            print(
                f"✓ Integration test passed: {points_awarded} points awarded to {test_wallet[:10]}..."
            )
            print(f"  User total: {user['total_points']}, tier: {user['tier']}")
            print(
                f"  Multipliers: quality={points_breakdown.get('quality_multiplier')}, "
                f"total={points_breakdown.get('total_multiplier')}"
            )

        finally:
            # Cleanup temp file
            import os

            if os.path.exists(temp_audio_path):
                os.unlink(temp_audio_path)

    finally:
        # Cleanup test data
        pool = await session_store._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM user_submissions WHERE wallet_address = $1", test_wallet
            )
            await conn.execute(
                "DELETE FROM users WHERE wallet_address = $1", test_wallet
            )
            await conn.execute(
                "DELETE FROM verification_sessions WHERE id = $1", session_id
            )


@pytest.mark.asyncio
async def test_points_skipped_if_no_wallet_address(
    mock_quality_result, mock_copyright_result, mock_analysis_result
):
    """Test that points are skipped gracefully if wallet address is missing."""
    session_store = SessionStore()
    pipeline = VerificationPipeline(session_store, "test_key", "test_key")

    # Metadata WITHOUT wallet address
    metadata = {"title": "Test Audio", "description": "Test", "sampleCount": 1}

    session_id = await session_store.create_session("test_id", {"metadata": metadata})

    try:
        # Mock pipeline methods
        pipeline.quality_checker.check_audio_file = AsyncMock(
            return_value=mock_quality_result
        )
        pipeline.copyright_detector.check_copyright_from_path = AsyncMock(
            return_value=mock_copyright_result
        )
        pipeline._stage_transcription = AsyncMock(return_value=("Test", ["en"]))
        pipeline._stage_analysis = AsyncMock(return_value=mock_analysis_result)

        # Create temp file
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(b"RIFF" + (36).to_bytes(4, "little") + b"WAVE")
            temp_path = f.name

        try:
            await pipeline.run_from_file(session_id, temp_path, metadata)

            # Session should complete but without points
            session = await session_store.get_session(session_id)
            assert session["status"] == "completed"

            # Points should be 0 or None (graceful skip)
            points = session.get("points_awarded") or 0
            assert points == 0, "Points should not be awarded without wallet address"

            print("✓ Test passed: Points correctly skipped when wallet address missing")

        finally:
            import os

            if os.path.exists(temp_path):
                os.unlink(temp_path)

    finally:
        await session_store._get_pool().then(
            lambda p: p.execute(
                "DELETE FROM verification_sessions WHERE id = $1", session_id
            )
        )


if __name__ == "__main__":
    # Run with: python -m pytest tests/test_points_integration.py -v -s
    pytest.main([__file__, "-v", "-s"])
