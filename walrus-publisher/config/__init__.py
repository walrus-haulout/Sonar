"""Configuration management for multi-platform deployments."""

from .platform import Config, detect_platform, is_production

__all__ = ["Config", "detect_platform", "is_production"]
