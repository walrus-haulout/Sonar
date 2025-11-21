"""
Type models for audio verification.

Centralized TypedDict and dataclass definitions for type safety
across ingress points (API, database, external services).
"""

from typing import TypedDict, Optional, Any
from datetime import datetime


class QualityResultDict(TypedDict, total=False):
    """Audio quality analysis result."""
    score: float
    duration: float
    sample_rate: int
    errors: list[str]
    warnings: list[str]
    clipping_detected: bool
    silence_detected: bool


class CopyrightResultDict(TypedDict, total=False):
    """Copyright detection result."""
    detected: bool
    matches: int
    confidence: float
    sources: list[str]


class AnalysisResultDict(TypedDict, total=False):
    """Audio content analysis result."""
    subject: str
    rarity_score: int
    specificity_grade: str
    languages: list[str]
    keywords: list[str]
    saturation_status: str


class ResultsDict(TypedDict, total=False):
    """Complete verification results."""
    quality: QualityResultDict
    copyright: CopyrightResultDict
    transcript: str
    analysis: AnalysisResultDict
    rarity_score: int
    saturation_penalty: int
    points_awarded: int


class InitialDataDict(TypedDict, total=False):
    """Initial submission metadata."""
    title: str
    description: str
    tags: list[str]
    languages: list[str]
    sample_count: int
    submission_type: str
    source_url: Optional[str]


class SessionDataDict(TypedDict, total=False):
    """Complete session data."""
    id: str
    wallet_address: str
    initial_data: InitialDataDict
    results: ResultsDict
    subject: Optional[str]
    sample_count: int
    subject_rarity_tier: str
    subject_rarity_multiplier: float
    dynamic_saturation_threshold: int
    total_subject_samples: int
    similar_count: int
    saturation_status: str
    saturation_penalty_applied: bool
    is_first_bulk_contributor: bool
    rarity_score: int
    points_awarded: int
    status: str
    created_at: datetime
    updated_at: datetime


def coerce_list_of_strings(value: Any) -> list[str]:
    """Convert value to list of strings."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(v) for v in value]
    return []


def coerce_int(value: Any) -> int:
    """Convert value to int."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except (ValueError, TypeError):
            return 0
    return 0


def coerce_float(value: Any) -> float:
    """Convert value to float."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
    return 0.0


def normalize_initial_data(data: dict[str, Any]) -> InitialDataDict:
    """Normalize raw initial data to typed model."""
    return InitialDataDict(
        title=str(data.get("title", "")),
        description=str(data.get("description", "")),
        tags=coerce_list_of_strings(data.get("tags", [])),
        languages=coerce_list_of_strings(data.get("languages", [])),
        sample_count=coerce_int(data.get("sample_count", 1)),
        submission_type=str(data.get("submission_type", "")),
        source_url=data.get("source_url")
    )


def normalize_quality(data: dict[str, Any]) -> QualityResultDict:
    """Normalize raw quality result to typed model."""
    return QualityResultDict(
        score=coerce_float(data.get("score", 0.0)),
        duration=coerce_float(data.get("duration", 0.0)),
        sample_rate=coerce_int(data.get("sample_rate", 0)),
        errors=coerce_list_of_strings(data.get("errors", [])),
        warnings=coerce_list_of_strings(data.get("warnings", [])),
        clipping_detected=bool(data.get("clipping_detected", False)),
        silence_detected=bool(data.get("silence_detected", False))
    )


def normalize_copyright(data: dict[str, Any]) -> CopyrightResultDict:
    """Normalize raw copyright result to typed model."""
    return CopyrightResultDict(
        detected=bool(data.get("detected", False)),
        matches=coerce_int(data.get("matches", 0)),
        confidence=coerce_float(data.get("confidence", 0.0)),
        sources=coerce_list_of_strings(data.get("sources", []))
    )


def normalize_analysis(data: dict[str, Any]) -> AnalysisResultDict:
    """Normalize raw analysis result to typed model."""
    return AnalysisResultDict(
        subject=str(data.get("subject", "")),
        rarity_score=coerce_int(data.get("rarity_score", 0)),
        specificity_grade=str(data.get("specificity_grade", "")),
        languages=coerce_list_of_strings(data.get("languages", [])),
        keywords=coerce_list_of_strings(data.get("keywords", [])),
        saturation_status=str(data.get("saturation_status", ""))
    )


def normalize_results(data: dict[str, Any]) -> ResultsDict:
    """Normalize raw results to typed model."""
    quality_data = data.get("quality", {})
    copyright_data = data.get("copyright", {})
    analysis_data = data.get("analysis", {})

    return ResultsDict(
        quality=normalize_quality(quality_data) if isinstance(quality_data, dict) else normalize_quality({}),
        copyright=normalize_copyright(copyright_data) if isinstance(copyright_data, dict) else normalize_copyright({}),
        transcript=str(data.get("transcript", "")),
        analysis=normalize_analysis(analysis_data) if isinstance(analysis_data, dict) else normalize_analysis({}),
        rarity_score=coerce_int(data.get("rarity_score", 0)),
        saturation_penalty=coerce_int(data.get("saturation_penalty", 0)),
        points_awarded=coerce_int(data.get("points_awarded", 0))
    )
