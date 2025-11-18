from typing import List, Optional
from config.platform import Config


class TransactionBuilder:
    """Builds unsigned register_blob transactions for browser sponsorship."""

    def __init__(
        self,
        walrus_package_id: Optional[str] = None,
        walrus_system_object: Optional[str] = None,
    ):
        if not walrus_package_id or not walrus_system_object:
            raise ValueError("WALRUS_PACKAGE_ID and WALRUS_SYSTEM_OBJECT must be set")

        self.walrus_package_id = walrus_package_id
        self.walrus_system_object = walrus_system_object

    def build_register_blob_transaction(
        self,
        blob_id: str,
        sub_wallet_address: str,
        epochs: int = 26,  # Default 1 year
    ) -> str:
        """
        Build an unsigned register_blob transaction.

        The transaction should be constructed such that:
        1. Sub-wallet signs the transaction kind (not the gas)
        2. Browser wallet sponsors the gas with its own signature
        3. Both signatures are combined before submission

        Returns base64-encoded transaction bytes.

        Note: In production, this would use pysui or sui-sdk to properly construct
        the Move call. For now, this is a placeholder showing the structure.
        """
        # This would use pysui TransactionBlock to build the actual transaction
        # Example structure (pseudocode):
        #
        # tx = TransactionBlock()
        # tx.move_call(
        #     module="0x...::walrus_ext",
        #     function="register_blob",
        #     type_arguments=[],
        #     arguments=[
        #         blob_id,
        #         epochs,
        #         self.walrus_system_object,
        #     ]
        # )
        # tx.set_gas_budget(1_000_000)  # Sponsor covers gas
        # tx_bytes = tx.build()
        # return base64.encode(tx_bytes)

        # Placeholder implementation
        import base64
        import hashlib

        # Generate deterministic pseudo-transaction bytes from inputs
        # In production, use proper Sui transaction building
        tx_data = f"{blob_id}:{sub_wallet_address}:{epochs}".encode()
        tx_hash = hashlib.sha256(tx_data).digest()
        tx_bytes = base64.b64encode(tx_hash).decode()

        return tx_bytes

    def build_batch_register_transactions(
        self,
        blob_registrations: List[dict],  # [{blob_id, sub_wallet_address, epochs}, ...]
    ) -> List[str]:
        """Build multiple register_blob transactions."""
        return [
            self.build_register_blob_transaction(
                reg["blob_id"],
                reg["sub_wallet_address"],
                reg.get("epochs", 26),
            )
            for reg in blob_registrations
        ]
