"""
Audio Feature Extraction for Vector Database Storage.

Extracts audio features (spectrogram, MFCC, chromagram) and generates
embeddings for storage in Pinecone audio-features namespace.
"""

import logging
import os
from typing import Dict, List, Optional
import numpy as np

logger = logging.getLogger(__name__)


class AudioFeatureExtractor:
    """Extracts features from audio data for semantic similarity."""

    def __init__(self):
        """Initialize audio feature extractor."""
        try:
            import librosa
            self.librosa = librosa
        except ImportError:
            logger.warning("librosa not installed, audio feature extraction disabled")
            self.librosa = None

    def extract_features(
        self,
        audio_path: str,
        sr: int = 22050
    ) -> Optional[Dict[str, List[float]]]:
        """
        Extract multiple audio features from file.

        Args:
            audio_path: Path to audio file
            sr: Sample rate (default 22050 Hz)

        Returns:
            Dict with feature names as keys and feature vectors as values
        """
        if not self.librosa:
            logger.warning("Cannot extract features: librosa not installed")
            return None

        try:
            y, sr = self.librosa.load(audio_path, sr=sr)

            features = {}

            # Mel-frequency cepstral coefficients (MFCCs)
            mfcc = self.librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1).tolist()
            features["mfcc_mean"] = mfcc_mean

            # Chroma features
            chroma = self.librosa.feature.chroma_stft(y=y, sr=sr)
            chroma_mean = np.mean(chroma, axis=1).tolist()
            features["chroma_mean"] = chroma_mean

            # Spectral centroid
            centroid = self.librosa.feature.spectral_centroid(y=y, sr=sr)
            features["spectral_centroid"] = [float(np.mean(centroid))]

            # Spectral rolloff
            rolloff = self.librosa.feature.spectral_rolloff(y=y, sr=sr)
            features["spectral_rolloff"] = [float(np.mean(rolloff))]

            # Zero crossing rate
            zcr = self.librosa.feature.zero_crossing_rate(y)
            features["zero_crossing_rate"] = [float(np.mean(zcr))]

            # Energy
            energy = np.sqrt(np.sum(y ** 2) / len(y))
            features["energy"] = [float(energy)]

            # RMS energy
            rms = self.librosa.feature.rms(y=y)
            features["rms_mean"] = [float(np.mean(rms))]

            logger.debug(f"Extracted features from {audio_path}")
            return features

        except Exception as e:
            logger.error(f"Error extracting features from {audio_path}: {e}")
            return None

    def concatenate_features(
        self,
        features: Dict[str, List[float]]
    ) -> List[float]:
        """
        Concatenate all features into single vector.

        Args:
            features: Dict of feature lists

        Returns:
            Single concatenated feature vector
        """
        vector = []
        for name in sorted(features.keys()):  # Sort for consistency
            vector.extend(features[name])
        return vector

    def normalize_features(self, vector: List[float]) -> List[float]:
        """
        Normalize feature vector to unit length.

        Args:
            vector: Feature vector

        Returns:
            Normalized vector
        """
        arr = np.array(vector)
        norm = np.linalg.norm(arr)
        if norm == 0:
            return vector
        return (arr / norm).tolist()

    def extract_and_normalize(
        self,
        audio_path: str,
        sr: int = 22050
    ) -> Optional[List[float]]:
        """
        Extract features, concatenate, and normalize in one step.

        Args:
            audio_path: Path to audio file
            sr: Sample rate

        Returns:
            Normalized feature vector or None if error
        """
        features = self.extract_features(audio_path, sr)
        if not features:
            return None

        vector = self.concatenate_features(features)
        return self.normalize_features(vector)

    def get_vector_dimension(self, features: Optional[Dict[str, List[float]]] = None) -> int:
        """
        Calculate actual dimension of concatenated feature vector.

        Args:
            features: Optional features dict to validate. If None, returns expected dimension.

        Returns:
            Vector dimension
        """
        if features:
            vector = self.concatenate_features(features)
            actual_dim = len(vector)
            expected_dim = self._expected_dimension()
            
            if actual_dim != expected_dim:
                logger.warning(
                    f"Feature vector dimension mismatch: expected {expected_dim}, got {actual_dim}"
                )
            
            return actual_dim
        
        return self._expected_dimension()

    def _expected_dimension(self) -> int:
        """
        Calculate expected dimension based on feature extraction.

        Returns:
            Expected vector dimension (should be consistent)
        """
        # MFCC: 13 + Chroma: 12 + Centroid: 1 + Rolloff: 1 + ZCR: 1 + Energy: 1 + RMS: 1 = 30
        return 30

    def validate_dimension(self, vector: List[float]) -> bool:
        """
        Validate that vector has expected dimension.

        Args:
            vector: Feature vector to validate

        Returns:
            True if dimension matches, False otherwise
        """
        expected = self._expected_dimension()
        actual = len(vector)
        
        if actual != expected:
            logger.error(
                f"Invalid feature vector dimension: expected {expected}, got {actual}"
            )
            return False
        
        return True


class AudioFeatureCache:
    """In-memory cache for extracted audio features."""

    def __init__(self, max_size: int = 1000):
        """
        Initialize feature cache.

        Args:
            max_size: Maximum number of cached features
        """
        self.cache: Dict[str, List[float]] = {}
        self.max_size = max_size
        self.hits = 0
        self.misses = 0

    def get(self, audio_path: str) -> Optional[List[float]]:
        """Get cached features."""
        if audio_path in self.cache:
            self.hits += 1
            return self.cache[audio_path]
        self.misses += 1
        return None

    def set(self, audio_path: str, features: List[float]) -> None:
        """Cache features."""
        if len(self.cache) >= self.max_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        self.cache[audio_path] = features

    def hit_rate(self) -> float:
        """Get cache hit rate."""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0

    def clear(self) -> None:
        """Clear cache."""
        self.cache.clear()
        self.hits = 0
        self.misses = 0


def create_audio_extractor() -> AudioFeatureExtractor:
    """Factory function to create extractor instance."""
    return AudioFeatureExtractor()
