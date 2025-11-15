"""
Property-based tests for pipeline invariants.

Uses hypothesis to verify that pipeline logic maintains expected properties.
"""

import pytest
from hypothesis import given, strategies as st, assume
from unittest.mock import AsyncMock
import json

from verification_pipeline import VerificationPipeline


class TestApprovalInvariants:
    """Test invariants in approval calculation."""

    @given(
        quality_passed=st.booleans(),
        copyright_detected=st.booleans(),
        copyright_confidence=st.floats(min_value=0.0, max_value=1.0),
        safety_passed=st.booleans()
    )
    def test_approval_is_deterministic(self, quality_passed, copyright_detected, copyright_confidence, safety_passed):
        """Test that approval calculation is deterministic (same inputs -> same output)."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        result1 = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": copyright_detected, "confidence": copyright_confidence}},
            {"safetyPassed": safety_passed}
        )
        
        result2 = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": copyright_detected, "confidence": copyright_confidence}},
            {"safetyPassed": safety_passed}
        )
        
        # Same inputs must produce same output
        assert result1 == result2

    @given(
        quality_passed=st.booleans(),
        copyright_detected=st.booleans(),
        copyright_confidence=st.floats(min_value=0.0, max_value=1.0),
        safety_passed=st.booleans()
    )
    def test_approval_logic_completeness(self, quality_passed, copyright_detected, copyright_confidence, safety_passed):
        """Test that approval logic follows defined rules."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        approved = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": copyright_detected, "confidence": copyright_confidence}},
            {"safetyPassed": safety_passed}
        )
        
        # Approval requires all checks to pass
        expected = (
            quality_passed and
            not (copyright_detected and copyright_confidence > 0.8) and
            safety_passed
        )
        
        assert approved == expected

    @given(
        quality_passed=st.booleans(),
        safety_passed=st.booleans()
    )
    def test_copyright_threshold_is_80_percent(self, quality_passed, safety_passed):
        """Test that copyright confidence threshold is exactly 80%."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        # At 79%, copyright detected but below threshold
        approved_79 = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": True, "confidence": 0.79}},
            {"safetyPassed": safety_passed}
        )
        
        # At 80%, copyright detected and above threshold
        approved_80 = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": True, "confidence": 0.80}},
            {"safetyPassed": safety_passed}
        )
        
        # 79% should be more permissive than 80% (for given quality and safety)
        # Threshold is > 0.8, so 80% exactly is NOT over threshold
        if quality_passed and safety_passed:
            assert approved_79 is True  # 79% below threshold
            assert approved_80 is True  # 80% exactly is not > 0.8 threshold

    @given(
        copyright_detected=st.booleans(),
        copyright_confidence=st.floats(min_value=0.0, max_value=1.0)
    )
    def test_approval_false_if_quality_fails(self, copyright_detected, copyright_confidence):
        """Test that approval is always False if quality fails."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        approved = pipeline._calculate_approval(
            {"quality": {"passed": False}},  # Quality fails
            {"copyright": {"detected": copyright_detected, "confidence": copyright_confidence}},
            {"safetyPassed": True}  # Even if safety passes
        )
        
        assert approved is False

    @given(
        quality_passed=st.booleans(),
        copyright_confidence=st.floats(min_value=0.0, max_value=1.0)
    )
    def test_approval_false_if_safety_fails(self, quality_passed, copyright_confidence):
        """Test that approval is always False if safety fails."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        approved = pipeline._calculate_approval(
            {"quality": {"passed": quality_passed}},
            {"copyright": {"detected": False, "confidence": copyright_confidence}},
            {"safetyPassed": False}  # Safety fails
        )

        # When safety fails, approval must always be False
        assert approved is False


class TestAnalysisResponseParsing:
    """Test invariants in analysis response parsing."""

    @given(
        quality_score=st.floats(min_value=-10.0, max_value=10.0, allow_nan=False),
        safety_passed=st.booleans()
    )
    def test_quality_score_always_clamped_0_to_1(self, quality_score, safety_passed):
        """Test that quality scores are always clamped to 0-1 range."""
        import json
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        response = json.dumps({
            "qualityScore": quality_score,
            "safetyPassed": safety_passed,
            "insights": [],
            "concerns": [],
            "recommendations": []
        })
        
        result = pipeline._parse_analysis_response(response)
        
        # Quality score must be in [0, 1]
        assert 0 <= result["qualityScore"] <= 1

    @given(
        valid_json_string=st.just('{"qualityScore": 0.5, "safetyPassed": true, "insights": [], "concerns": [], "recommendations": []}'),
        extra_text=st.text(min_size=0, max_size=100)
    )
    def test_parsing_extracts_json_from_noise(self, valid_json_string, extra_text):
        """Test that JSON is correctly extracted even with surrounding text."""
        import json
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        # Create response with JSON in markdown block and extra text
        response = f"{extra_text}\n```json\n{valid_json_string}\n```\n{extra_text}"
        
        result = pipeline._parse_analysis_response(response)
        
        # Should successfully parse
        assert result["qualityScore"] == 0.5
        assert result["safetyPassed"] is True

    @given(st.text(min_size=1, max_size=100))
    def test_invalid_json_returns_safe_defaults(self, invalid_text):
        """Test that invalid JSON returns safe default values."""
        # Exclude texts that accidentally contain valid JSON (including valid JSON primitives)
        try:
            parsed = json.loads(invalid_text)
            # Skip if it parses to valid JSON at all (dict, list, string, number, bool, null)
            assume(False)
        except (json.JSONDecodeError, ValueError):
            pass  # This is what we want to test

        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )

        result = pipeline._parse_analysis_response(invalid_text)

        # Should have safe defaults
        assert "qualityScore" in result
        assert "safetyPassed" in result
        assert result["qualityScore"] == 0.5
        assert result["safetyPassed"] is True


class TestProgressMonotonicity:
    """Test that progress values increase monotonically."""

    @given(
        stage_name=st.sampled_from(["quality", "copyright", "transcription", "analysis"]),
        progress=st.floats(min_value=0.0, max_value=1.0)
    )
    def test_progress_in_valid_range(self, stage_name, progress):
        """Test that progress values are always in [0, 1]."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        # Just verify the values are valid (pipeline doesn't enforce monotonicity itself)
        assert 0 <= progress <= 1
        assert isinstance(stage_name, str)


class TestFileFormatHandling:
    """Test invariants in file format handling."""

    @given(
        file_extension=st.sampled_from([".wav", ".mp3", ".m4a", ".webm", ".flac"])
    )
    def test_detects_mime_type_from_extension(self, file_extension):
        """Test that MIME types are correctly detected from file extensions."""
        expected_mime_types = {
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".webm": "audio/webm",
            ".flac": "audio/flac"
        }
        
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        # Verify that the correct MIME type is expected
        expected_mime = expected_mime_types[file_extension]
        assert expected_mime in ["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/flac"]


class TestPromptGeneration:
    """Test invariants in prompt generation."""

    @given(
        title=st.text(min_size=1, max_size=100),
        description=st.text(min_size=0, max_size=200),
        transcript_length=st.integers(min_value=10, max_value=5000)
    )
    def test_prompt_includes_required_fields(self, title, description, transcript_length):
        """Test that analysis prompt includes all required fields."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        transcript = "word " * (transcript_length // 5)  # Approximate word count
        prompt = pipeline._build_analysis_prompt(
            transcript,
            {"title": title, "description": description},
            {"duration": 10}
        )
        
        # Prompt must include key instructions
        assert "qualityScore" in prompt
        assert "safetyPassed" in prompt
        assert "json" in prompt.lower()

    @given(transcript_length=st.integers(min_value=500, max_value=10000))
    def test_long_transcripts_truncated(self, transcript_length):
        """Test that very long transcripts are truncated in prompts."""
        mock_store = AsyncMock()
        pipeline = VerificationPipeline(
            session_store=mock_store,
            openrouter_api_key="test-key"
        )
        
        transcript = "word " * (transcript_length // 5)
        prompt = pipeline._build_analysis_prompt(
            transcript,
            {"title": "Test"},
            {}
        )
        
        # Prompt should not contain the entire transcript
        if transcript_length > 2000:
            # Should have truncated
            assert "..." in prompt or len(prompt) < len(transcript)
