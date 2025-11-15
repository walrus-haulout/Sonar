"""
Gemini Rarity Analyzer with Omnisearch Integration.

Main orchestrator that combines all rarity detection components
and calls Gemini with web search capabilities.
"""

import asyncio
import httpx
import json
import logging
import os
from typing import Dict, Optional, List, Any

logger = logging.getLogger(__name__)


class GeminiRarityAnalyzer:
    """Analyze audio rarity using Gemini with web search."""

    def __init__(self):
        """Initialize analyzer."""
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")

    async def analyze_rarity(
        self,
        session_data: Dict[str, Any],
        similarity_data: Dict[str, Any],
        saturation_data: Dict[str, Any],
        bulk_data: Dict[str, Any],
        subject_rarity_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze audio rarity using Gemini with web search.

        This is the main orchestration function that combines all
        rarity detection components.

        Args:
            session_data: Metadata from verification session
            similarity_data: Semantic similarity results
            saturation_data: Saturation calculations
            bulk_data: Bulk contributor status
            subject_rarity_data: Subject rarity tier info

        Returns:
            Complete rarity analysis with score
        """
        try:
            # Build comprehensive prompt for Gemini
            prompt = self._build_analysis_prompt(
                session_data,
                similarity_data,
                saturation_data,
                bulk_data,
                subject_rarity_data
            )

            # Call Gemini with web search tools
            # Note: This will be enhanced to use omnisearch MCP
            response = await self._call_gemini_with_analysis(prompt)

            # Parse and return results
            return self._parse_analysis_response(response, session_data)

        except Exception as e:
            logger.error(f"Error analyzing rarity: {e}", exc_info=True)
            return self._default_analysis(session_data)

    def _build_analysis_prompt(
        self,
        session_data: Dict[str, Any],
        similarity_data: Dict[str, Any],
        saturation_data: Dict[str, Any],
        bulk_data: Dict[str, Any],
        subject_rarity_data: Dict[str, Any]
    ) -> str:
        """Build detailed prompt for Gemini analysis."""

        similar_list = similarity_data.get("similar", [])[:5]
        similar_text = "\n".join([
            f"- {s['verification_id']}: similarity {s['similarity_score']:.2f}"
            for s in similar_list
        ]) if similar_list else "None"

        prompt = f"""Analyze the rarity of this audio dataset submission.

METADATA:
- Title: {session_data.get('title')}
- Description: {session_data.get('description')}
- Subject: {session_data.get('subject')}
- Languages: {', '.join(session_data.get('languages', []))}
- Tags: {', '.join(session_data.get('tags', []))}
- Transcript Preview: {session_data.get('transcriptPreview', '')[:200]}

AUDIO CHARACTERISTICS:
- Duration: {session_data.get('duration_seconds')} seconds
- Sample Rate: {session_data.get('sample_rate')} Hz
- Quality Score: {session_data.get('quality_score')}
- Silence Percent: {session_data.get('silence_percent')}%

BULK SUBMISSION STATUS:
- Sample Count: {session_data.get('sample_count', 1)}
- Is Bulk: {bulk_data.get('is_bulk')}
- Is First Bulk: {bulk_data.get('is_first_bulk')}
- Message: {bulk_data.get('message')}

SUBJECT RARITY (from web research):
- Rarity Tier: {subject_rarity_data.get('rarity_tier')}
- Multiplier: {subject_rarity_data.get('rarity_multiplier')}x
- Dynamic Threshold: {subject_rarity_data.get('dynamic_threshold')} samples
- Research Summary: {subject_rarity_data.get('web_research_summary')}

SATURATION DATA:
- Similar Count: {saturation_data.get('similar_count')}
- Dynamic Threshold: {saturation_data.get('dynamic_threshold')}
- Saturation Status: {saturation_data.get('status')}
- Penalty Applied: {saturation_data.get('penalty_applied')}
- Most Similar Datasets:
{similar_text}

ANALYSIS TASK:
Based on all the above information, determine:

1. RARITY SCORE (0-100):
   - Consider: subject rarity tier, saturation level, specificity, bulk status
   - Higher score = more rare/valuable
   - Apply saturation penalty if threshold exceeded

2. SPECIFICITY GRADE (A-F):
   - A: Highly detailed, specific variants
   - B: Good detail, mostly specific
   - C: Adequate detail, somewhat specific
   - D: Generic, some specific elements
   - E: Very generic
   - F: No detail

3. VERIFICATION STATUS:
   - verified: All factual claims verified
   - partially_verified: Some claims verified
   - unverified: No verification possible

4. DISCOVERED PATTERN:
   - What category/cluster does this belong to?

5. MARKET GAP ALIGNMENT:
   - Does this fill known gaps in audio AI training?
   - Score 0-100 on how much this is needed

6. COMPETITIVE EDGE:
   - How does this compare to ElevenLabs/competitors?

Please provide your response in this JSON format:
{{
  "rarity_score": <0-100>,
  "specificity_grade": "<A-F>",
  "verification_status": "<verified|partially_verified|unverified>",
  "discovered_pattern": "<category or cluster>",
  "market_gap_score": <0-100>,
  "competitive_edge": "<brief description>",
  "reasoning": "<detailed explanation of scoring>",
  "web_search_recommendations": ["<search that would help>", ...]
}}"""

        return prompt

    async def _call_gemini_with_analysis(self, prompt: str) -> Optional[str]:
        """
        Call Gemini API with analysis prompt.

        Args:
            prompt: Analysis prompt

        Returns:
            Gemini response text
        """
        try:
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
                        "max_tokens": 1000,
                        "temperature": 0.3
                    },
                    timeout=60.0
                )

                if response.status_code != 200:
                    logger.error(f"Gemini API error: {response.status_code}")
                    return None

                data = response.json()
                return data["choices"][0]["message"]["content"]

        except Exception as e:
            logger.error(f"Error calling Gemini: {e}", exc_info=True)
            return None

    def _parse_analysis_response(
        self,
        response: str,
        session_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Parse Gemini's JSON response.

        Args:
            response: Gemini response text
            session_data: Original session metadata

        Returns:
            Parsed analysis
        """
        try:
            # Extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1

            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                analysis = json.loads(json_str)

                return {
                    "rarity_score": int(analysis.get("rarity_score", 50)),
                    "specificity_grade": analysis.get("specificity_grade", "D"),
                    "verification_status": analysis.get("verification_status", "unverified"),
                    "discovered_pattern": analysis.get("discovered_pattern", "unknown"),
                    "market_gap_score": int(analysis.get("market_gap_score", 50)),
                    "competitive_edge": analysis.get("competitive_edge", ""),
                    "reasoning": analysis.get("reasoning", ""),
                    "web_search_recommendations": analysis.get("web_search_recommendations", []),
                    "subject": session_data.get("subject"),
                    "is_first_bulk_contributor": False  # Will be set elsewhere
                }
            else:
                logger.warning("Could not find JSON in Gemini response")
                return self._default_analysis(session_data)

        except json.JSONDecodeError as e:
            logger.error(f"Error parsing Gemini response: {e}")
            return self._default_analysis(session_data)

    def _default_analysis(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """Return default analysis if parsing fails."""
        return {
            "rarity_score": 50,
            "specificity_grade": "D",
            "verification_status": "unverified",
            "discovered_pattern": "unknown",
            "market_gap_score": 50,
            "competitive_edge": "Unknown",
            "reasoning": "Default analysis due to processing error",
            "web_search_recommendations": [],
            "subject": session_data.get("subject"),
            "is_first_bulk_contributor": False
        }

    async def get_web_search_context(
        self,
        subject: str,
        queries: List[str]
    ) -> Dict[str, List[str]]:
        """
        Get web search context for subject rarity research.

        This method will integrate with omnisearch MCP tools.
        For now, it's a placeholder showing the interface.

        Args:
            subject: Subject to research
            queries: List of search queries to execute

        Returns:
            Dictionary of search results per query
        """
        # TODO: Integrate with omnisearch MCP
        # This will use: web_search, github_search, ai_search tools
        # to gather information about subject rarity
        return {
            query: [f"Result for: {query}"]
            for query in queries
        }


def create_gemini_analyzer() -> GeminiRarityAnalyzer:
    """Factory function to create analyzer instance."""
    return GeminiRarityAnalyzer()
