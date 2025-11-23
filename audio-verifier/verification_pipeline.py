"""
Verification Pipeline for SONAR Audio Datasets

Six-stage pipeline:
1. Quality Check (AudioQualityChecker)
2. Copyright Check (Chromaprint + AcoustID)
3. Transcription (Whisper via OpenRouter)
4. AI Analysis (Gemini via OpenRouter)
5. Aggregation
6. Finalization
"""

import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional, cast, List

from openai import OpenAI

from audio_checker import AudioQualityChecker
from fingerprint import CopyrightDetector
from session_store import SessionStore

logger = logging.getLogger(__name__)

# OpenRouter model identifiers
OPENROUTER_MODELS = {
    "TRANSCRIPTION": "mistralai/voxtral-small-24b-2507",  # Voxtral Small for transcription
    "ANALYSIS": "google/gemini-2.5-flash",  # Gemini 2.5 Flash for analysis
}


class VerificationPipeline:
    """
    Orchestrates the full verification pipeline for audio datasets.

    Manages temp files and ensures cleanup even on failures.
    All verification state is recorded in PostgreSQL.
    """

    def __init__(
        self,
        session_store: SessionStore,
        openrouter_api_key: str,
        acoustid_api_key: Optional[str] = None,
    ):
        """
        Initialize the verification pipeline.

        Args:
            session_store: Session store for session state (PostgreSQL)
            openrouter_api_key: OpenRouter API key for transcription and analysis
            acoustid_api_key: AcoustID API key for copyright detection
        """
        self.session_store = session_store

        # Initialize OpenRouter client (OpenAI-compatible API)
        self.openai_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_api_key,
            default_headers={
                "HTTP-Referer": "https://projectsonar.xyz",
                "X-Title": "SONAR Audio Marketplace",
            },
        )

        # Initialize quality and copyright checkers
        self.quality_checker = AudioQualityChecker()
        self.copyright_detector = CopyrightDetector(acoustid_api_key)

    @asynccontextmanager
    async def _temp_audio_file(self, audio_bytes: bytes, extension: str = ".wav"):
        """
        Context manager for temporary audio files.
        Ensures cleanup even if pipeline fails.

        Args:
            audio_bytes: Raw audio data
            extension: File extension (e.g., ".wav", ".mp3")

        Yields:
            Path to temporary file
        """
        temp_fd, temp_path = tempfile.mkstemp(
            suffix=extension,
            prefix="verify_",
            dir="/tmp/audio-verifier"
            if os.path.exists("/tmp/audio-verifier")
            else None,
        )

        try:
            # Write bytes to temp file
            os.write(temp_fd, audio_bytes)
            os.close(temp_fd)

            logger.debug(f"Created temp file: {temp_path}")
            yield temp_path

        finally:
            # CRITICAL: Always clean up temp file
            try:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                    logger.debug(f"Cleaned up temp file: {temp_path}")
            except OSError as e:
                logger.warning(f"Failed to delete temp file {temp_path}: {e}")

    async def run_from_file(
        self,
        session_object_id: str,
        audio_file_path: str,
        metadata: Dict[str, Any],
        blob_id: Optional[str] = None,
    ) -> None:
        """
        Run the complete six-stage verification pipeline from a file path.

        This method streams from disk to avoid loading large files (up to 13GB) into memory.
        The temp file is automatically cleaned up after processing.

        Args:
            session_object_id: Verification session ID (UUID)
            audio_file_path: Path to temporary audio file on disk
            metadata: Dataset metadata (title, description, etc.)
            blob_id: Optional Walrus blob ID for logging correlation
        """
        logger.info(
            f"Starting verification pipeline for session {session_object_id[:8]}... from file {audio_file_path}"
        )

        try:
            # Run the standard pipeline with file path (avoids loading into RAM)
            await self.run(session_object_id, audio_file_path, metadata, blob_id)

        except Exception as e:
            logger.error(
                f"[{session_object_id[:8]}...] Pipeline failed: {e}", exc_info=True
            )
            success = await self.session_store.mark_failed(
                session_object_id,
                {"errors": [f"Pipeline error: {str(e)}"], "stage_failed": "system"},
            )
            if not success:
                logger.error(
                    f"Failed to mark session {session_object_id[:8]}... as failed"
                )
        finally:
            # Always clean up temp file
            try:
                if os.path.exists(audio_file_path):
                    os.unlink(audio_file_path)
                    logger.debug(f"Cleaned up temp file: {audio_file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temp file {audio_file_path}: {e}")

    async def run(
        self,
        session_object_id: str,
        audio_file_path: str,
        metadata: Dict[str, Any],
        blob_id: Optional[str] = None,
    ) -> None:
        """
        Run the complete six-stage verification pipeline.

        Args:
            session_object_id: Verification session ID (UUID)
            audio_file_path: Path to audio file on disk (avoids loading 13GB into RAM)
            metadata: Dataset metadata (title, description, etc.)
            blob_id: Optional Walrus blob ID for logging correlation
        """
        logger.info(
            f"Starting verification pipeline for session {session_object_id[:8]}..."
        )

        try:
            # Stage 1: Quality Check
            logger.info(f"[{session_object_id}] Stage 1: Quality Check")
            quality_result = await self._stage_quality_check(
                session_object_id, audio_file_path, blob_id
            )

            # Handle quality check failure (returns None for invalid audio)
            if quality_result is None:
                logger.warning(
                    f"[{session_object_id}] Quality check returned None - invalid or corrupted audio file"
                )
                success = await self.session_store.mark_failed(
                    session_object_id,
                    {
                        "errors": ["Invalid or corrupted audio file"],
                        "stage_failed": "quality",
                    },
                )
                if not success:
                    logger.error(f"Failed to mark session as failed")
                return

            # Fail fast if quality check fails
            quality_info = quality_result.get("quality") or {}
            if not quality_info.get("passed", False):
                failure_reason = quality_result.get("failure_reason", "unknown")
                logger.warning(
                    f"[{session_object_id}] Failed quality check: {failure_reason}"
                )
                success = await self.session_store.mark_failed(
                    session_object_id,
                    {
                        "quality": quality_info,
                        "errors": quality_result.get("errors", []),
                        "stage_failed": "quality",
                        "failure_reason": failure_reason,
                    },
                )
                if not success:
                    logger.error(f"Failed to mark session as failed")
                return

            # Stage 2: Copyright Check
            logger.info(f"[{session_object_id}] Stage 2: Copyright Check")
            copyright_result = await self._stage_copyright_check(
                session_object_id, audio_file_path
            )

            # Handle copyright check failure
            if copyright_result is None:
                logger.warning(f"[{session_object_id}] Copyright check failed")
                copyright_result = {
                    "copyright": {},
                    "errors": ["Copyright check unavailable"],
                }

            # Stage 3: Transcription
            logger.info(f"[{session_object_id}] Stage 3: Transcription")
            transcript = await self._stage_transcription(
                session_object_id, audio_file_path
            )

            # Handle transcription failure
            if not transcript:
                logger.warning(f"[{session_object_id}] Transcription returned empty")
                success = await self.session_store.mark_failed(
                    session_object_id,
                    {
                        "errors": ["Failed to transcribe audio"],
                        "stage_failed": "transcription",
                    },
                )
                if not success:
                    logger.error(f"Failed to mark session as failed")
                return

            # Stage 4: AI Analysis
            logger.info(f"[{session_object_id}] Stage 4: AI Analysis")
            analysis_result = await self._stage_analysis(
                session_object_id,
                transcript,
                metadata,
                quality_result.get("quality", {}),
            )

            # Stage 5: Aggregation
            logger.info(f"[{session_object_id}] Stage 5: Aggregation")
            await self._update_stage(session_object_id, "finalizing", 0.95)

            # Calculate final approval
            approved = self._calculate_approval(
                quality_result, copyright_result, analysis_result
            )

            # Stage 6: Finalization
            logger.info(f"[{session_object_id}] Stage 6: Finalization")
            completion_payload = {
                "approved": approved,
                "quality": quality_result.get("quality"),
                "copyright": copyright_result.get("copyright"),
                "transcript": transcript,
                "transcriptPreview": transcript[:200],
                "analysis": analysis_result,
                "safetyPassed": analysis_result.get("safetyPassed", False),
            }
            completed = await self.session_store.mark_completed(
                session_object_id, completion_payload
            )

            if not completed:
                raise RuntimeError("Failed to finalize verification")

            logger.info(f"[{session_object_id}] Pipeline completed approved={approved}")

        except Exception as e:
            logger.error(f"[{session_object_id}] Pipeline failed: {e}", exc_info=True)
            success = await self.session_store.mark_failed(
                session_object_id,
                {"errors": [f"Pipeline error: {str(e)}"], "stage_failed": "system"},
            )
            if not success:
                logger.error(f"Failed to mark session as failed")

    async def _stage_quality_check(
        self,
        session_object_id: str,
        audio_file_path: str,
        blob_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stage 1: Quality Check

        Uses AudioQualityChecker to verify technical audio quality.

        Args:
            session_object_id: Session UUID
            audio_file_path: Path to audio file
            blob_id: Optional Walrus blob ID for logging correlation
        """
        import time

        stage_start = time.time()

        await self._update_stage(session_object_id, "quality", 0.15)

        result = await self.quality_checker.check_audio_file(
            audio_file_path, session_id=session_object_id
        )

        quality_info = result.get("quality")
        quality_passed = quality_info.get("passed", False) if quality_info else False
        errors = result.get("errors", [])
        failure_reason = result.get("failure_reason")
        warnings = result.get("warnings", [])

        if quality_info:
            quality_info["score"] = self._compute_quality_score(quality_info)

        stage_duration = time.time() - stage_start

        # Store warnings in session (non-fatal, stored regardless of pass/fail)
        if warnings:
            await self.session_store.add_warnings(session_object_id, warnings)
            logger.info(
                f"[{session_object_id}] Quality check captured {len(warnings)} warning(s)",
                extra={"session_id": session_object_id, "warnings": warnings},
            )

        if not quality_passed:
            blob_id_short = blob_id[:16] if blob_id else "unknown"
            logger.warning(
                f"[{session_object_id}] Quality check failed",
                extra={
                    "session_id": session_object_id,
                    "blob_id_short": blob_id_short,
                    "duration_seconds": round(stage_duration, 2),
                    "quality_info": quality_info,
                    "errors": errors,
                    "failure_reason": failure_reason or "unknown",
                },
            )
        else:
            logger.info(
                f"[{session_object_id}] Quality check passed",
                extra={
                    "session_id": session_object_id,
                    "duration_seconds": round(stage_duration, 2),
                    "quality_score": quality_info.get("score")
                    if quality_info
                    else None,
                },
            )

        await self._update_stage(session_object_id, "quality", 0.30)

        return result

    async def _stage_copyright_check(
        self, session_object_id: str, audio_file_path: str
    ) -> Dict[str, Any]:
        """
        Stage 2: Copyright Check

        Uses Chromaprint + AcoustID for copyright detection.
        """
        import time

        stage_start = time.time()

        await self._update_stage(session_object_id, "copyright", 0.35)
        result = await self.copyright_detector.check_copyright_from_path(
            audio_file_path
        )

        stage_duration = time.time() - stage_start
        copyright_info = result.get("copyright", {})
        errors = result.get("errors", [])

        if copyright_info.get("error"):
            logger.warning(
                f"[{session_object_id}] Copyright check failed",
                extra={
                    "session_id": session_object_id,
                    "duration_seconds": round(stage_duration, 2),
                    "error": copyright_info.get("error"),
                },
            )
        else:
            logger.info(
                f"[{session_object_id}] Copyright check completed",
                extra={
                    "session_id": session_object_id,
                    "duration_seconds": round(stage_duration, 2),
                    "matches_found": len(copyright_info.get("matches", [])),
                },
            )

        await self._update_stage(session_object_id, "copyright", 0.45)

        return result

    async def _stage_transcription(
        self, session_object_id: str, audio_file_path: str
    ) -> str:
        """
        Stage 3: Transcription

        Uses Voxtral Small via OpenRouter to transcribe audio to text.
        Enforces 100MB size limit to prevent API overload and memory issues.
        """
        import time
        import base64

        stage_start = time.time()

        await self._update_stage(session_object_id, "transcription", 0.55)

        try:
            logger.debug(
                f"[{session_object_id}] Transcribing audio via OpenRouter Voxtral"
            )

            # Max 100MB for transcription (OpenRouter API constraint)
            MAX_TRANSCRIPTION_SIZE_MB = 100
            max_size_bytes = MAX_TRANSCRIPTION_SIZE_MB * 1024**2

            # Read audio file as base64 for chat completions API
            with open(audio_file_path, "rb") as audio_file:
                audio_bytes = audio_file.read()

            # Validate file size before base64 encoding
            if len(audio_bytes) > max_size_bytes:
                raise ValueError(
                    f"Audio file {len(audio_bytes)} bytes exceeds "
                    f"{MAX_TRANSCRIPTION_SIZE_MB}MB limit for transcription"
                )

            audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

            logger.debug(
                f"[{session_object_id}] Audio file loaded",
                extra={
                    "session_id": session_object_id,
                    "file_size_bytes": len(audio_bytes),
                },
            )

            # Determine audio MIME type from file extension
            audio_mime = "audio/wav"
            if audio_file_path.endswith(".mp3"):
                audio_mime = "audio/mpeg"
            elif audio_file_path.endswith(".m4a"):
                audio_mime = "audio/mp4"
            elif audio_file_path.endswith(".webm"):
                audio_mime = "audio/webm"
            elif audio_file_path.endswith(".flac"):
                audio_mime = "audio/flac"

            # Call Voxtral via OpenRouter chat completions API
            # OpenRouter uses OpenAI-compatible format for multimodal inputs
            transcription_messages = cast(
                List[Any],
                [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Transcribe this audio with enhanced closed caption style formatting.

Include:
- Speaker labels if multiple speakers detected (e.g., "Speaker 1:", "Speaker 2:", or use names if identifiable)
- Sound effects in parentheses (e.g., "(bird calls)", "(door slam)", "(music playing)", "(applause)")
- Unintelligible sections as "(unintelligible)"
- Environmental sounds as "(ambient noise)", "(traffic sounds)", "(wind)", etc.
- Non-speech vocalizations as "(laughter)", "(sighs)", "(coughs)", "(gasps)", etc.
- Musical elements as "(music)", "(singing)", "(instrumental)", etc.

Format example:
Speaker 1: Hello, how are you doing today? (background music)
Speaker 2: I'm great, thanks! (door opens) Oh, someone's here.
(footsteps approaching)
Speaker 3: Hey everyone! (unintelligible)

Provide clean, readable transcript with these annotations. Each speaker's dialogue should start on a new line.""",
                            },
                            {
                                "type": "input_audio",
                                "input_audio": f"data:{audio_mime};base64,{audio_base64}",
                            },
                        ],
                    }
                ],
            )

            api_start = time.time()
            completion = self.openai_client.chat.completions.create(
                model=OPENROUTER_MODELS["TRANSCRIPTION"],
                messages=transcription_messages,
                max_tokens=4096,
            )
            api_duration = time.time() - api_start

            transcript = completion.choices[0].message.content.strip()

            # Count closed caption features
            speaker_count = transcript.count("Speaker")
            annotation_count = transcript.count("(")
            has_unintelligible = "(unintelligible)" in transcript

            stage_duration = time.time() - stage_start
            logger.info(
                f"[{session_object_id}] Transcription completed",
                extra={
                    "session_id": session_object_id,
                    "duration_seconds": round(stage_duration, 2),
                    "api_duration_seconds": round(api_duration, 2),
                    "transcript_length_chars": len(transcript),
                    "transcript_preview": transcript[:200] + "..."
                    if len(transcript) > 200
                    else transcript,
                    "speakers_detected": speaker_count,
                    "sound_annotations": annotation_count,
                    "has_unintelligible": has_unintelligible,
                },
            )

            await self._update_stage(session_object_id, "transcription", 0.65)

            return transcript

        except Exception as e:
            stage_duration = time.time() - stage_start
            logger.error(
                f"[{session_object_id}] Transcription failed: {e}",
                extra={
                    "session_id": session_object_id,
                    "duration_seconds": round(stage_duration, 2),
                },
                exc_info=True,
            )
            raise Exception(f"Failed to transcribe audio: {str(e)}")

    async def _stage_analysis(
        self,
        session_object_id: str,
        transcript: str,
        metadata: Dict[str, Any],
        quality_info: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Stage 4: AI Analysis

        Uses Gemini Flash via OpenRouter to analyze content quality, safety, and value.
        """
        await self._update_stage(session_object_id, "analysis", 0.75)

        # Build analysis prompt (ported from frontend/lib/ai/analysis.ts)
        prompt = self._build_analysis_prompt(transcript, metadata, quality_info)

        # Log categorization for validation tracking
        categorization = metadata.get("categorization", {})
        use_case = categorization.get("useCase", "Not specified")
        content_type = categorization.get("contentType", "Not specified")
        domain = categorization.get("domain", "Not specified")

        logger.info(
            f"[{session_object_id}] Categorization validation starting",
            extra={
                "session_id": session_object_id,
                "user_provided_use_case": use_case,
                "user_provided_content_type": content_type,
                "user_provided_domain": domain,
                "title": metadata.get("title", "Unknown"),
                "description_preview": metadata.get("description", "")[:100],
            },
        )

        try:
            # Call Gemini 2.5 Flash via OpenRouter
            analysis_messages = cast(
                List[Any],
                [
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            )
            completion = self.openai_client.chat.completions.create(
                model=OPENROUTER_MODELS["ANALYSIS"],
                max_tokens=2048,
                temperature=0.3,  # Lower temperature for consistent analysis
                messages=analysis_messages,
            )

            content = completion.choices[0].message.content
            if content is None:
                raise ValueError("No content in API response")
            response_text = content.strip()

            # Parse JSON response
            analysis = self._parse_analysis_response(response_text)

            # Generate per-file analysis if per-file metadata is present
            per_file_metadata = metadata.get("perFileMetadata", [])
            if per_file_metadata and len(per_file_metadata) > 1:
                per_file_data = [
                    {
                        "title": pf.get("title", f"File {i + 1}"),
                        "description": pf.get("description", ""),
                    }
                    for i, pf in enumerate(per_file_metadata)
                ]

                # Build and call per-file analysis
                pf_prompt = self._build_per_file_analysis_prompt(
                    transcript, metadata, per_file_data
                )

                try:
                    pf_messages = cast(
                        List[Any],
                        [{"role": "user", "content": pf_prompt}],
                    )
                    pf_completion = self.openai_client.chat.completions.create(
                        model=OPENROUTER_MODELS["ANALYSIS"],
                        max_tokens=1024,
                        temperature=0.3,
                        messages=pf_messages,
                    )

                    pf_content = pf_completion.choices[0].message.content
                    if pf_content:
                        pf_analyses = self._parse_per_file_response(pf_content.strip())
                        if pf_analyses:
                            analysis["fileAnalyses"] = pf_analyses

                except Exception as e:
                    logger.warning(f"Per-file analysis failed: {e}")

            await self._update_stage(session_object_id, "analysis", 0.85)

            # Extract quality component scores for logging
            quality_analysis = analysis.get("qualityAnalysis", {})
            clarity_score = quality_analysis.get("clarity", {}).get("score")
            content_value_score = quality_analysis.get("contentValue", {}).get("score")
            metadata_accuracy_score = quality_analysis.get("metadataAccuracy", {}).get(
                "score"
            )
            completeness_score = quality_analysis.get("completeness", {}).get("score")

            # Extract categorization-related concerns for validation logging
            all_concerns = analysis.get("concerns", [])
            categorization_concerns = [
                c
                for c in all_concerns
                if any(
                    keyword in c.lower()
                    for keyword in [
                        "labeled",
                        "domain",
                        "use case",
                        "content type",
                        "categorization",
                    ]
                )
            ]

            logger.info(
                f"[{session_object_id}] AI Analysis completed",
                extra={
                    "session_id": session_object_id,
                    "quality_score": analysis.get("qualityScore"),
                    "clarity_score": clarity_score,
                    "content_value_score": content_value_score,
                    "metadata_accuracy_score": metadata_accuracy_score,
                    "metadata_accuracy_reasoning": quality_analysis.get(
                        "metadataAccuracy", {}
                    ).get("reasoning", "")[:150],
                    "completeness_score": completeness_score,
                    "suggested_price": analysis.get("suggestedPrice"),
                    "safety_passed": analysis.get("safetyPassed"),
                    "insights_count": len(analysis.get("insights", [])),
                    "concerns_count": len(all_concerns),
                    "concerns": all_concerns[:3],  # First 3 concerns
                    "categorization_concerns": categorization_concerns,  # Specific tag validation issues
                    "overall_summary_preview": analysis.get("overallSummary", "")[:100],
                },
            )

            return analysis

        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)
            await self._update_stage(session_object_id, "analysis", 0.85)
            # Return safe defaults if analysis fails
            return {
                "qualityScore": 0.5,
                "suggestedPrice": 3.0,
                "safetyPassed": True,
                "insights": ["Analysis parsing failed - manual review recommended"],
                "concerns": ["Unable to parse detailed analysis"],
            }

    def _build_analysis_prompt(
        self, transcript: str, metadata: Dict[str, Any], quality_info: Dict[str, Any]
    ) -> str:
        """
        Build enhanced Gemini analysis prompt with structured reasoning.

        Ported from frontend/lib/ai/analysis.ts
        """
        # Format audio metadata
        audio_meta_str = ""
        if quality_info:
            audio_meta_str = f"""- Duration: {quality_info.get("duration", 0):.1f}s
- Sample Rate: {quality_info.get("sample_rate", 0)}Hz
- Channels: {quality_info.get("channels", 0)}
- Bit Depth: {quality_info.get("bit_depth", 0)}"""

        # Extract categorization fields
        categorization = metadata.get("categorization", {})
        use_case = categorization.get("useCase", "Not specified")
        content_type = categorization.get("contentType", "Not specified")
        domain = categorization.get("domain", "Not specified")

        # Truncate transcript if too long
        transcript_sample = (
            transcript[:2000] + "..." if len(transcript) > 2000 else transcript
        )

        return f"""You are an expert audio dataset quality analyst for the SONAR Protocol, a decentralized audio data marketplace. Analyze this audio dataset submission and provide a comprehensive, detailed quality assessment with transparent reasoning.

## Dataset Metadata
- Title: {metadata.get("title", "Unknown")}
- Description: {metadata.get("description", "No description")}
- Languages: {", ".join(metadata.get("languages", []))}
- Tags: {", ".join(metadata.get("tags", []))}

## Content Categorization (User-Provided)
- Use Case: {use_case}
- Content Type: {content_type}
- Domain: {domain}

## Audio Technical Specs
{audio_meta_str}

## Transcript Sample
{transcript_sample}

## Analysis Required

Provide your analysis in the following JSON format with detailed reasoning:

```json
{{
  "qualityScore": 0.85,
  "suggestedPrice": 5.0,
  "safetyPassed": true,
  "overallSummary": "2-3 sentence narrative describing the audio's overall quality, clarity, and key characteristics",
  "qualityAnalysis": {{
    "clarity": {{
      "score": 0.9,
      "reasoning": "Explanation of clarity assessment (transcription coherence, minimal errors, etc.)"
    }},
    "contentValue": {{
      "score": 0.8,
      "reasoning": "Explanation of content value (usefulness for AI training, diversity, relevance, etc.)"
    }},
    "metadataAccuracy": {{
      "score": 0.85,
      "reasoning": "Explanation of how well content matches provided metadata"
    }},
    "completeness": {{
      "score": 0.8,
      "reasoning": "Explanation of completeness (no obvious truncation, full context preserved, etc.)"
    }}
  }},
  "priceAnalysis": {{
    "basePrice": 3.0,
    "qualityMultiplier": 1.4,
    "rarityMultiplier": 1.0,
    "finalPrice": 5.0,
    "breakdown": "Step-by-step explanation of pricing calculation (e.g., 'Base 3 SUI × quality multiplier 1.4 × rarity 1.0 = 4.2, rounded to 5 SUI based on market positioning')"
  }},
  "insights": [
    "Key strength or characteristic 1",
    "Key strength or characteristic 2",
    "Key strength or characteristic 3"
  ],
  "concerns": [
    "Any quality concerns (if applicable)"
  ],
  "recommendations": {{
    "critical": ["High-priority improvements needed"],
    "suggested": ["Recommended improvements"],
    "optional": ["Nice-to-have enhancements"]
  }}
}}
```

### Quality Scoring Criteria (0-1 scale):
- **Audio Clarity** (0.3): Is the transcript coherent? Minimal transcription errors? Clear speaker articulation?
- **Content Value** (0.3): Is the content meaningful, diverse, and useful for AI training? Does it offer unique training signal?
- **Metadata Accuracy** (0.2): Does the content match the provided metadata? Are descriptions accurate? **CRITICAL**: Verify that the user-provided categorization accurately describes the actual audio content:
  - Does the actual content match the claimed **Use Case**? (e.g., if labeled "podcast", is it actually podcast-style dialogue? If labeled "music", does it contain music?)
  - Does the **Content Type** align with what you hear? (e.g., if labeled "speech/dialogue", is it really dialogue vs. monologue or music?)
  - Does the **Domain** make sense? (e.g., if labeled "healthcare", does it discuss medical topics? If labeled "education", is it educational content?)
  - Flag significant mismatches in the "concerns" array with specific details (e.g., "Audio labeled as 'podcast' but contains only instrumental music", "Claimed domain 'healthcare' but discusses unrelated entertainment topics")
- **Completeness** (0.2): Is the content complete without obvious truncation? Are complete thoughts/sentences included?

**Default Quality Score**: If the audio is average/unremarkable with no notable quality issues or standout features, use 0.5 (50%) as the default baseline score.

### Purchase Price Suggestion (3-10 SUI):
Suggest a fair market price in SUI tokens (minimum: 3, maximum: 10) based on:
- **Quality Score** (40%): Higher quality = higher price (0.5-0.7 = 1.0-1.3x, 0.7-0.85 = 1.3-1.6x, 0.85-1.0 = 1.6-2.0x)
- **Content Uniqueness** (30%): Rare/unique content commands premium (common = 1.0x, unique = 1.2x, rare = 1.5x)
- **Duration & Completeness** (20%): Longer, complete datasets worth more
- **Metadata Richness** (10%): Well-documented datasets more valuable

Pricing Guidelines:
- 3-4 SUI: Basic quality, common content, limited value
- 5-6 SUI: Good quality, useful content, practical value
- 7-8 SUI: High quality, unique/specialized content, strong value
- 9-10 SUI: Exceptional quality, rare/premium content, exceptional value

Show your calculation: Base price × quality multiplier × rarity multiplier

### Safety Screening:
Flag as unsafe (safetyPassed: false) ONLY if content contains:
- Sexually explicit content or pornography
- Graphic violence, gore, or disturbing violent imagery
- Copyrighted material (recognizable songs, music, or audio from movies/TV/radio)

All other content is acceptable. Conversational datasets with profanity, political discussion, or other sensitive topics are ACCEPTABLE.

### Insights:
Provide 3-5 specific, actionable insights about:
- Content quality and clarity assessment
- Potential use cases (conversational AI, voice synthesis, etc.)
- Unique characteristics or standout features
- Market value proposition and competitive positioning

**If there are no notable insights**, use an empty array: "insights": []

### Concerns:
List specific quality or content issues found. **If there are no concerns**, use an empty array: "concerns": []

### Recommendations:
Categorize suggestions by priority:
- **Critical**: Issues that significantly impact quality (e.g., missing segments, poor audio quality)
- **Suggested**: Improvements that would enhance value (e.g., better metadata, additional context)
- **Optional**: Nice-to-have enhancements (e.g., extended analysis, supplementary materials)

**If there are no recommendations**, use: "recommendations": {{"critical": [], "suggested": [], "optional": []}}

Respond ONLY with the JSON object, no additional text."""

    def _build_per_file_analysis_prompt(
        self,
        transcript: str,
        metadata: Dict[str, Any],
        per_file_data: List[Dict[str, str]],
    ) -> str:
        """
        Build prompt for per-file AI analysis.

        Args:
            transcript: Full transcript of the audio
            metadata: Dataset metadata
            per_file_data: List of per-file metadata (title, description)

        Returns:
            Prompt string requesting per-file analysis
        """
        files_description = ""
        for i, file_info in enumerate(per_file_data, 1):
            files_description += f"\n{i}. {file_info.get('title', f'File {i}')}"
            if file_info.get("description"):
                files_description += f" - {file_info['description']}"

        transcript_sample = (
            transcript[:2000] + "..." if len(transcript) > 2000 else transcript
        )

        return f"""You are analyzing a multi-file audio dataset. Based on the transcript and file information, provide per-file quality insights.

## Files in Dataset:{files_description}

## Transcript Sample
{transcript_sample}

Provide your analysis in the following JSON format:

```json
{{
  "fileAnalyses": [
    {{
      "fileIndex": 0,
      "title": "File Title",
      "score": 0.85,
      "summary": "One-sentence assessment of this file's quality",
      "strengths": ["Strength 1", "Strength 2"],
      "concerns": ["Concern 1"],
      "recommendations": ["Recommendation 1"]
    }}
  ]
}}
```

For each file:
- Estimate its relative quality based on the transcript
- Identify file-specific strengths and concerns
- Suggest improvements
- Keep assessments concise

Respond ONLY with the JSON object, no additional text."""

    def _parse_per_file_response(
        self, response_text: str
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Parse per-file analysis response from AI.

        Returns None if parsing fails (not critical).
        """
        try:
            # Extract JSON from markdown code blocks if present
            json_match = response_text.find("```json")
            if json_match != -1:
                start = json_match + 7
                end = response_text.find("```", start)
                json_string = response_text[start:end].strip()
            else:
                json_string = response_text.strip()

            parsed = json.loads(json_string)
            return parsed.get("fileAnalyses", []) if isinstance(parsed, dict) else None

        except Exception as e:
            logger.warning(f"Failed to parse per-file analysis: {e}")
            return None

    def _parse_analysis_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse Gemini's enhanced analysis JSON response.

        Handles new structured fields (qualityAnalysis, priceAnalysis, overallSummary)
        while maintaining backward compatibility.
        """
        try:
            # Extract JSON from markdown code blocks if present
            json_match = response_text.find("```json")
            if json_match != -1:
                start = json_match + 7  # len("```json\n")
                end = response_text.find("```", start)
                json_string = response_text[start:end].strip()
            else:
                json_string = response_text.strip()

            parsed = json.loads(json_string)

            # Validate response structure
            if (
                not isinstance(parsed.get("qualityScore"), (int, float))
                or not isinstance(parsed.get("safetyPassed"), bool)
                or not isinstance(parsed.get("insights"), list)
            ):
                raise ValueError("Invalid response structure from Gemini")

            # Normalize quality score to 0-1 range
            quality_score = max(0.0, min(1.0, float(parsed["qualityScore"])))

            # Extract and clamp suggested price to 3-10 SUI range
            suggested_price = parsed.get("suggestedPrice", 3.0)
            try:
                suggested_price = float(suggested_price)
                suggested_price = max(
                    3.0, min(10.0, suggested_price)
                )  # Clamp to 3-10 range
            except (TypeError, ValueError):
                suggested_price = 3.0  # Default to minimum if invalid

            # Extract new structured fields (gracefully handle if missing)
            quality_analysis = parsed.get("qualityAnalysis")
            price_analysis = parsed.get("priceAnalysis")
            overall_summary = parsed.get("overallSummary", "")

            # Handle both new categorized and legacy flat recommendations
            recommendations_raw = parsed.get("recommendations", [])
            if isinstance(recommendations_raw, dict):
                # New format: {"critical": [...], "suggested": [...], "optional": [...]}
                recommendations = recommendations_raw
            else:
                # Legacy format: flat list
                recommendations = (
                    {"suggested": recommendations_raw} if recommendations_raw else {}
                )

            result = {
                "qualityScore": quality_score,
                "suggestedPrice": suggested_price,
                "safetyPassed": bool(parsed["safetyPassed"]),
                "insights": parsed.get("insights", []),
                "concerns": parsed.get("concerns", []),
                "recommendations": recommendations,
                "overallSummary": overall_summary,
            }

            # Add enhanced fields if present
            if quality_analysis:
                result["qualityAnalysis"] = quality_analysis
            if price_analysis:
                result["priceAnalysis"] = price_analysis

            return result

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error(f"Failed to parse analysis response: {e}")
            logger.error(f"Raw response: {response_text}")

            # Return safe defaults if parsing fails
            fallback = {
                "qualityScore": 0.5,
                "suggestedPrice": 3.0,
                "safetyPassed": True,
                "insights": [
                    "Analysis completed but response parsing failed",
                    "Manual review recommended",
                ],
                "concerns": ["Unable to parse detailed analysis"],
                "recommendations": {},
                "overallSummary": "",
            }
            return fallback

    def _calculate_approval(
        self,
        quality_result: Dict[str, Any],
        copyright_result: Dict[str, Any],
        analysis_result: Dict[str, Any],
    ) -> bool:
        """
        Calculate final approval based on all verification stages.

        Approval requires:
        - Quality check passed
        - No high-confidence copyright match
        - Safety check passed
        """
        quality_info = quality_result.get("quality") or {}
        quality_passed = quality_info.get("passed", False)

        copyright_info = copyright_result.get("copyright") or {}
        copyright_detected = copyright_info.get("detected", False)
        copyright_confidence = copyright_info.get("confidence", 0.0)

        # Consider it a copyright issue only if high confidence (>80%)
        high_confidence_copyright = copyright_detected and copyright_confidence > 0.8

        safety_passed = analysis_result.get("safetyPassed", False)

        approved = quality_passed and not high_confidence_copyright and safety_passed

        logger.info(
            f"Approval calculation: quality={quality_passed}, "
            f"copyright_ok={not high_confidence_copyright}, "
            f"safety={safety_passed} => {approved}",
            extra={
                "quality_score": analysis_result.get("qualityScore"),
                "suggested_price": analysis_result.get("suggestedPrice"),
                "concerns": analysis_result.get("concerns", []),
                "copyright_detected": copyright_detected,
                "copyright_confidence": copyright_confidence,
                "copyright_matches": copyright_info.get("matched_songs", []),
                "safety_passed": safety_passed,
                "final_approved": approved,
            },
        )

        return approved

    async def _update_stage(
        self, session_object_id: str, stage_name: str, progress: float
    ) -> None:
        """
        Helper to update stage in KV and raise if the update fails.
        """
        success = await self.session_store.update_stage(
            session_object_id, stage_name, progress
        )
        if not success:
            raise RuntimeError(
                f"Failed to update stage '{stage_name}' for session {session_object_id[:8]}..."
            )
        logger.info(
            "stage_update session=%s stage=%s progress=%.2f",
            session_object_id[:8],
            stage_name,
            progress,
        )

    def _compute_quality_score(self, quality: Dict[str, Any]) -> int:
        """
        Compute an intuitive quality score (0-100) from quality metrics.
        """
        if not quality.get("passed"):
            return 0

        score = 100

        duration = quality.get("duration", 0)
        sample_rate = quality.get("sample_rate", 0)
        clipping = quality.get("clipping_detected", quality.get("clipping", False))
        silence_percent = quality.get("silence_percent", 0.0)
        volume_ok = quality.get("volume_ok", False)

        if (
            duration < self.quality_checker.MIN_DURATION
            or duration > self.quality_checker.MAX_DURATION
        ):
            score -= 25
        if sample_rate < self.quality_checker.MIN_SAMPLE_RATE:
            score -= 25
        if clipping:
            score -= 20
        if silence_percent >= self.quality_checker.MAX_SILENCE_PERCENT:
            score -= 15
        if not volume_ok:
            score -= 15

        return max(0, min(100, int(score)))
