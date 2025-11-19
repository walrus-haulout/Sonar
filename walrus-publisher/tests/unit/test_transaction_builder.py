import pytest
import base64
from transaction_builder import TransactionBuilder


def test_transaction_builder_init():
    builder = TransactionBuilder(
        walrus_package_id="0x1234567890abcdef",
        walrus_system_object="0x0000000000000000000000000000000000000000000000000000000000000000",
    )
    assert builder.walrus_package_id == "0x1234567890abcdef"
    assert builder.walrus_system_object == "0x0000000000000000000000000000000000000000000000000000000000000000"


def test_transaction_builder_missing_config():
    with pytest.raises(ValueError):
        TransactionBuilder(walrus_package_id=None, walrus_system_object="0x0")


def test_build_register_blob_transaction():
    builder = TransactionBuilder(
        walrus_package_id="0x1234567890abcdef",
        walrus_system_object="0x0000000000000000000000000000000000000000000000000000000000000000",
    )
    tx_bytes = builder.build_register_blob_transaction(
        blob_id="test_blob_id_123",
        sub_wallet_address="0x1234567890123456789012345678901234567890",
    )
    assert isinstance(tx_bytes, str)
    assert len(tx_bytes) > 0
    try:
        decoded = base64.b64decode(tx_bytes)
        assert len(decoded) > 0
    except Exception:
        pytest.fail("tx_bytes is not valid base64")


def test_transaction_builder_whitespace_trim():
    builder = TransactionBuilder(
        walrus_package_id="  0x1234567890abcdef  ",
        walrus_system_object="  0x0000000000000000000000000000000000000000000000000000000000000000  ",
    )
    assert builder.walrus_package_id == "0x1234567890abcdef"
    assert builder.walrus_system_object == "0x0000000000000000000000000000000000000000000000000000000000000000"
