from typing import Optional
from config.platform import Config


class TransactionBuilder:
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
        epochs: int = 26,
    ) -> str:
        raise NotImplementedError("Requires pysui integration for Move call construction")
