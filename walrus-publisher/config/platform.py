import os
from typing import Literal


def detect_platform() -> Literal["railway", "digitalocean", "fly", "generic"]:
    """Auto-detect deployment platform based on environment variables."""
    if os.getenv("RAILWAY_ENVIRONMENT_ID"):
        return "railway"
    if os.getenv("DD_ENV"):  # DigitalOcean App Platform
        return "digitalocean"
    if os.getenv("FLY_APP_NAME"):
        return "fly"
    return "generic"


def get_port() -> int:
    """Get port from environment, with platform-specific defaults."""
    return int(os.getenv("PORT", "8080"))


def get_host() -> str:
    """Get host binding address."""
    return os.getenv("HOST", "0.0.0.0")


def get_redis_url() -> str:
    """Get Redis connection URL from platform-specific env vars."""
    # Railway Redis
    if redis_url := os.getenv("REDIS_URL"):
        return redis_url
    # Generic
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


def is_production() -> bool:
    """Check if running in production."""
    platform = detect_platform()
    return platform != "generic"


class Config:
    """Global configuration."""

    PLATFORM = detect_platform()
    PORT = get_port()
    HOST = get_host()
    REDIS_URL = get_redis_url()
    VERSION = "0.1.0"

    # Walrus configuration
    WALRUS_PUBLISHER_URL = os.getenv(
        "WALRUS_PUBLISHER_URL",
        "https://publisher.walrus-mainnet.walrus.space",
    )
    WALRUS_AGGREGATOR_URL = os.getenv(
        "WALRUS_AGGREGATOR_URL",
        "https://aggregator.walrus-mainnet.walrus.space",
    )
    WALRUS_PACKAGE_ID = os.getenv("WALRUS_PACKAGE_ID")
    WALRUS_SYSTEM_OBJECT = os.getenv("WALRUS_SYSTEM_OBJECT")

    # Sui network
    SUI_RPC_URL = os.getenv("SUI_RPC_URL", "https://fullnode.mainnet.sui.io:443")
    SUI_NETWORK = os.getenv("SUI_NETWORK", "mainnet")

    # Upload settings
    MAX_WALLETS = int(os.getenv("MAX_WALLETS", "256"))
    CHUNK_MIN_SIZE = int(os.getenv("CHUNK_MIN_SIZE", "1048576"))  # 1MB
    CHUNK_MAX_SIZE = int(os.getenv("CHUNK_MAX_SIZE", "536870912"))  # 500MB
    SESSION_TTL = int(os.getenv("SESSION_TTL", "3600"))  # 1 hour

    # Feature flags
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
