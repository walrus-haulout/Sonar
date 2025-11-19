from typing import Optional
import base64
from config.platform import Config
from pysui.sui.sui_txn_builder import SuiTransactionBuilder
from pysui.sui.sui_types import SuiAddress


class TransactionBuilder:
    def __init__(
        self,
        walrus_package_id: Optional[str] = None,
        walrus_system_object: Optional[str] = None,
    ):
        if not walrus_package_id or not walrus_system_object:
            raise ValueError("WALRUS_PACKAGE_ID and WALRUS_SYSTEM_OBJECT must be set")

        self.walrus_package_id = walrus_package_id.strip()
        self.walrus_system_object = walrus_system_object.strip()

    def build_register_blob_transaction(
        self,
        blob_id: str,
        sub_wallet_address: str,
        epochs: int = 26,
    ) -> str:
        builder = SuiTransactionBuilder()

        builder.move_call(
            target=f"{self.walrus_package_id}::storage::register_blob",
            arguments=[
                builder.pure(self.walrus_system_object),
                builder.pure(blob_id),
                builder.pure(epochs),
            ],
            type_arguments=[],
        )

        builder.set_sender(SuiAddress.from_hex_string(sub_wallet_address))

        tx_bytes = builder.build()
        return base64.b64encode(tx_bytes).decode("utf-8")
