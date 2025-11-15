"""
Subject Extractor.

Extracts the main subject/topic from audio metadata using Gemini.
Handles: species, equipment, accents, sounds, etc.
"""

import logging
import httpx
import json
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class SubjectExtractor:
    """Extracts main subject from audio metadata."""

    def __init__(self, openrouter_api_key: Optional[str] = None):
        """
        Initialize extractor.

        Args:
            openrouter_api_key: OpenRouter API key
        """
        self.openrouter_api_key = openrouter_api_key
        if not self.openrouter_api_key:
            import os
            self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")

        if not self.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")

    async def extract_subject(
        self,
        title: str,
        description: str,
        specificity_details: Optional[str] = None,
        tags: Optional[list] = None
    ) -> Optional[str]:
        """
        Extract main subject from metadata.

        Args:
            title: Audio dataset title
            description: Audio dataset description
            specificity_details: Detailed specificity information
            tags: List of tags

        Returns:
            Main subject (e.g., "Javan Hawk-Eagle", "1967 Mustang", "Brooklyn accent")
        """
        try:
            prompt = f"""Extract the main subject/topic from this audio dataset.
Return ONLY the subject name, nothing else.

If it's a species, use scientific name if possible. For example:
- "Cardinal" → "Northern Cardinal (Cardinalis cardinalis)"
- "Dog bark" → "Dog bark (Canis familiaris)"

If it's equipment, include model/year. For example:
- "Mustang engine" → "1967 Ford Mustang engine idle"

If it's a person/dialect, include specifics. For example:
- "Brooklyn accent" → "Brooklyn Italian-American accent (3rd generation)"

If it's a sound effect, be specific. For example:
- "Door slam" → "Oak barn door slam (iron hinges)"

DATASET INFORMATION:
Title: {title}
Description: {description}
{f'Details: {specificity_details}' if specificity_details else ''}
{f'Tags: {", ".join(tags)}' if tags else ''}

Return ONLY the subject name (1-2 sentences max):"""

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openrouter_api_key}",
                        "HTTP-Referer": "https://sonar-protocol.com",
                        "X-Title": "Sonar Audio Verifier"
                    },
                    json={
                        "model": "google/gemini-2.5-flash",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 100,
                        "temperature": 0.3
                    },
                    timeout=30.0
                )

                if response.status_code != 200:
                    logger.error(f"Gemini API error: {response.status_code}")
                    return None

                data = response.json()
                subject = data["choices"][0]["message"]["content"].strip()

                if subject:
                    logger.debug(f"Extracted subject: {subject}")
                    return subject

                return None

        except Exception as e:
            logger.error(f"Error extracting subject: {e}", exc_info=True)
            return None

    async def extract_subject_category(
        self,
        subject: str
    ) -> Optional[str]:
        """
        Categorize the subject (speech, animal, sound effect, music, etc.).

        Args:
            subject: The subject to categorize

        Returns:
            Category (e.g., "animal", "speech", "sound_effect")
        """
        try:
            prompt = f"""Categorize this audio subject into ONE of these categories:
- animal_sound (animal vocalizations)
- speech (human conversation, dialogue)
- accent_dialect (specific accents or dialects)
- equipment_sound (engine, machinery, tools)
- music_instrument (musical sounds)
- environmental (nature, weather, ambient)
- foley (footsteps, impacts, materials)
- sound_effect (explosions, doors, impacts)
- vocal_performance (singing, beatboxing, screaming)
- non_verbal (coughing, breathing, laughter)
- mechanical (mechanical devices, industrial)
- other

Subject: {subject}

Return ONLY the category name from the list above:"""

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openrouter_api_key}",
                        "HTTP-Referer": "https://sonar-protocol.com",
                        "X-Title": "Sonar Audio Verifier"
                    },
                    json={
                        "model": "google/gemini-2.5-flash",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 50,
                        "temperature": 0.2
                    },
                    timeout=30.0
                )

                if response.status_code != 200:
                    logger.error(f"Gemini API error: {response.status_code}")
                    return None

                data = response.json()
                category = data["choices"][0]["message"]["content"].strip().lower()

                return category if category else None

        except Exception as e:
            logger.error(f"Error categorizing subject: {e}", exc_info=True)
            return None


def create_subject_extractor() -> SubjectExtractor:
    """Factory function to create extractor instance."""
    return SubjectExtractor()
