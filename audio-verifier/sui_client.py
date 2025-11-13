"""
Sui Blockchain Client for Verification Sessions.

Replaces Vercel KV with on-chain verification session management.
All state transitions are recorded on Sui blockchain for transparency and auditability.
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional
from threading import Lock
from pysui import SuiConfig, SyncClient
from pysui.sui.sui_types.scalars import ObjectID, SuiString
from pysui.sui.sui_txn import SyncTransaction

logger = logging.getLogger(__name__)


# Verification stage constants (must match contracts/sources/verification_session.move)
STAGE_QUEUED = 0
STAGE_INGESTING = 1
STAGE_QUALITY_CHECK = 2
STAGE_COPYRIGHT_CHECK = 3
STAGE_TRANSCRIPTION = 4
STAGE_ANALYSIS = 5
STAGE_FINALIZING = 6
STAGE_COMPLETED = 7
STAGE_FAILED = 255

# Stage name mappings for human-readable logs
STAGE_NAMES = {
    "queued": STAGE_QUEUED,
    "ingesting": STAGE_INGESTING,
    "quality": STAGE_QUALITY_CHECK,
    "copyright": STAGE_COPYRIGHT_CHECK,
    "transcription": STAGE_TRANSCRIPTION,
    "analysis": STAGE_ANALYSIS,
    "finalizing": STAGE_FINALIZING,
    "completed": STAGE_COMPLETED,
    "failed": STAGE_FAILED
}


class SuiVerificationClient:
    """
    Client for managing verification sessions on Sui blockchain.

    Provides methods for creating sessions, updating stages, and finalizing results.
    All operations are blockchain transactions requiring ValidatorCap authorization.
    """

    def __init__(
        self,
        network: str,
        validator_keystring: str,
        package_id: str,
        session_registry_id: str,
        validator_cap_id: str
    ):
        """
        Initialize Sui verification client.

        Args:
            network: Sui network ("testnet", "mainnet", "devnet", "localnet")
            validator_keystring: Private key string for validator (format: "key_scheme://base64_key")
            package_id: Deployed SONAR package object ID
            session_registry_id: Shared SessionRegistry object ID
            validator_cap_id: ValidatorCap object ID owned by this validator
        """
        # Initialize Sui client
        self.config = SuiConfig.default_config() if network == "mainnet" else SuiConfig.user_config(
            rpc_url=self._get_rpc_url(network)
        )

        # Load validator key and create client
        self.config.add_keypair_from_keystring(validator_keystring)
        self.client = SyncClient(self.config)

        # Store contract object IDs
        self.package_id = package_id
        self.session_registry_id = session_registry_id
        self.validator_cap_id = validator_cap_id

        # Get validator address
        self.validator_address = self.config.active_address

        self._client_lock = Lock()

        logger.info(f"Initialized Sui client on {network} network")
        logger.info(f"Validator address: {self.validator_address}")
        logger.info(f"Package ID: {package_id}")

    def _get_rpc_url(self, network: str) -> str:
        """Get RPC URL for specified network."""
        urls = {
            "mainnet": "https://fullnode.mainnet.sui.io:443",
            "testnet": "https://fullnode.testnet.sui.io:443",
            "devnet": "https://fullnode.devnet.sui.io:443",
            "localnet": "http://127.0.0.1:9000"
        }
        return urls.get(network, urls["testnet"])

    async def create_session(
        self,
        verification_id: str,
        initial_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Create a new verification session on blockchain.

        Calls: verification_session::create_session()

        Args:
            verification_id: Unique verification identifier (not used on-chain, for logging only)
            initial_data: Initial session data containing:
                - plaintext_cid: Walrus blob ID of plaintext audio
                - plaintext_size_bytes: Size in bytes
                - duration_seconds: Audio duration
                - file_format: Audio format (e.g., "audio/wav")

        Returns:
            Session object ID if successful, None otherwise
        """
        try:
            return await asyncio.to_thread(
                self._create_session_sync,
                verification_id,
                initial_data,
            )
        except Exception as e:
            logger.error(f"Error creating session on blockchain: {e}", exc_info=True)
            return None

    def _create_session_sync(self, verification_id: str, initial_data: Dict[str, Any]) -> Optional[str]:
        plaintext_cid = initial_data.get("plaintext_cid", "")
        plaintext_size_bytes = initial_data.get("plaintext_size_bytes", 0)
        duration_seconds = initial_data.get("duration_seconds", 0)
        file_format = initial_data.get("file_format", "audio/wav")

        with self._client_lock:
            txn = SyncTransaction(client=self.client)
            txn.move_call(
                target=f"{self.package_id}::verification_session::create_session",
                arguments=[
                    ObjectID(self.session_registry_id),
                    SuiString(plaintext_cid),
                    plaintext_size_bytes,
                    duration_seconds,
                    SuiString(file_format),
                ],
            )
            result = txn.execute(gas_budget="10000000")

        if result.is_ok():
            effects = result.result_data.effects
            created_objects = effects.created if hasattr(effects, 'created') else []

            session_id = None
            for obj in created_objects:
                if hasattr(obj, 'reference') and hasattr(obj.reference, 'objectId'):
                    session_id = str(obj.reference.objectId)
                    break

            logger.info(
                f"Created verification session on-chain: {verification_id} "
                f"(object ID: {session_id})"
            )
            return session_id

        logger.error(f"Failed to create session: {result.result_string}")
        return None

    async def update_stage(
        self,
        session_object_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """
        Update verification session stage on blockchain.

        Calls: verification_session::update_stage()

        Args:
            session_object_id: On-chain VerificationSession object ID
            updates: Dictionary with stage updates:
                - stage: Stage name (str) or stage number (int)
                - progress: Progress percentage (0-100)

        Returns:
            True if successful, False otherwise
        """
        try:
            return await asyncio.to_thread(
                self._update_stage_sync,
                session_object_id,
                updates,
            )
        except Exception as e:
            logger.error(f"Error updating stage on blockchain: {e}", exc_info=True)
            return False

    def _update_stage_sync(self, session_object_id: str, updates: Dict[str, Any]) -> bool:
        stage = updates.get("stage")
        progress_percent = int(updates.get("progress", 0) * 100)

        if isinstance(stage, str):
            stage_num = STAGE_NAMES.get(stage.lower())
            if stage_num is None:
                logger.warning(f"Unknown stage name: {stage}, skipping update")
                return False
        else:
            stage_num = stage

        with self._client_lock:
            txn = SyncTransaction(client=self.client)
            txn.move_call(
                target=f"{self.package_id}::verification_session::update_stage",
                arguments=[
                    ObjectID(self.validator_cap_id),
                    ObjectID(session_object_id),
                    ObjectID(self.session_registry_id),
                    stage_num,
                    progress_percent,
                ],
            )
            result = txn.execute(gas_budget="10000000")

        if result.is_ok():
            logger.info(
                f"Updated session {session_object_id[:8]}... to stage {stage_num} "
                f"({progress_percent}%)"
            )
            return True

        logger.error(f"Failed to update stage: {result.result_string}")
        return False

    async def mark_completed(
        self,
        session_object_id: str,
        result_data: Dict[str, Any]
    ) -> bool:
        """
        Mark verification as completed on blockchain.

        Calls: verification_session::finalize_verification()

        Args:
            session_object_id: On-chain VerificationSession object ID
            result_data: Final verification results containing:
                - approved: bool
                - quality: dict with score
                - transcript: string (will be hashed)
                - safetyPassed: bool

        Returns:
            True if successful, False otherwise
        """
        try:
            return await asyncio.to_thread(
                self._mark_completed_sync,
                session_object_id,
                result_data,
            )
        except Exception as e:
            logger.error(f"Error finalizing session: {e}", exc_info=True)
            return False

    def _mark_completed_sync(self, session_object_id: str, result_data: Dict[str, Any]) -> bool:
        import hashlib

        approved = bool(result_data.get("approved", False))
        safety_passed = bool(result_data.get("safetyPassed", False))

        quality = result_data.get("quality") or {}
        quality_score = max(0, min(100, int(quality.get("score", 0))))

        transcript = result_data.get("transcript") or ""
        transcript_hash = list(hashlib.sha256(transcript.encode()).digest())

        quality_metrics_json = json.dumps(quality or {}, sort_keys=True).encode()
        quality_metrics_hash = list(hashlib.sha256(quality_metrics_json).digest())

        logger.info(
            f"Finalizing session {session_object_id[:8]}... "
            f"(approved: {approved}, quality: {quality_score}, safety: {safety_passed})"
        )
        transcript_preview = result_data.get("transcriptPreview")
        if transcript_preview:
            logger.debug("Transcript preview: %s", transcript_preview)

        with self._client_lock:
            txn = SyncTransaction(client=self.client)
            txn.move_call(
                target=f"{self.package_id}::verification_session::finalize_verification",
                arguments=[
                    ObjectID(self.validator_cap_id),
                    ObjectID(session_object_id),
                    quality_score,
                    safety_passed,
                    approved,
                    transcript_hash,
                    quality_metrics_hash,
                ],
            )
            result = txn.execute(gas_budget="10000000")

        if result.is_ok():
            logger.info(f"Session {session_object_id[:8]}... finalized on-chain")
            return True

        logger.error(f"Failed to finalize session: {result.result_string}")
        return False

    async def mark_failed(
        self,
        session_object_id: str,
        error_data: Dict[str, Any]
    ) -> bool:
        """
        Mark verification as failed on blockchain.

        Calls: verification_session::update_stage() with STAGE_FAILED

        Args:
            session_object_id: On-chain VerificationSession object ID
            error_data: Error information (logged off-chain, not stored on-chain)

        Returns:
            True if successful, False otherwise
        """
        try:
            stage_failed = error_data.get("stage_failed", "unknown")
            errors = error_data.get("errors", [])

            logger.warning(
                f"Marking session {session_object_id[:8]}... as failed "
                f"(stage: {stage_failed}, errors: {errors})"
            )

            # Update to STAGE_FAILED
            success = await self.update_stage(session_object_id, {
                "stage": STAGE_FAILED,
                "progress": 0
            })

            if success:
                logger.warning(f"Session {session_object_id[:8]}... marked failed on-chain")

            return success

        except Exception as e:
            logger.error(f"Error marking session failed: {e}", exc_info=True)
            return False

    async def get_session(self, session_object_id: str) -> Optional[Dict[str, Any]]:
        """
        Get verification session from blockchain.

        NOTE: This queries on-chain state but returns a simplified view.
        For full session history, use Sui explorer or indexer.

        Args:
            session_object_id: On-chain VerificationSession object ID

        Returns:
            Session data if found, None otherwise
        """
        try:
            return await asyncio.to_thread(self._get_session_sync, session_object_id)
        except Exception as e:
            logger.error(f"Error retrieving session: {e}", exc_info=True)
            return None

    def _get_session_sync(self, session_object_id: str) -> Optional[Dict[str, Any]]:
        with self._client_lock:
            result = self.client.get_object(session_object_id)

        if result.is_ok() and result.result_data:
            obj_data = result.result_data
            logger.debug(f"Retrieved session {session_object_id[:8]}... from blockchain")
            return {
                "id": session_object_id,
                "on_chain": True,
                "object_data": obj_data
            }

        logger.warning(f"Session not found on blockchain: {session_object_id}")
        return None

    async def close(self) -> None:
        """Close the Sui client (no-op for SyncClient)."""
        logger.info("Closing Sui client")
        # SyncClient doesn't need explicit closing
        pass
