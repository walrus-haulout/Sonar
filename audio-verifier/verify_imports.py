import sys
import importlib

def check_import(module_name):
    try:
        importlib.import_module(module_name)
        print(f"✅ {module_name} imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Failed to import {module_name}: {e}")
        return False

print(f"Python executable: {sys.executable}")
print("Verifying imports...")

success = True
success &= check_import("httpx")
success &= check_import("cryptography")
success &= check_import("cryptography.hazmat.primitives.ciphers.aead")
success &= check_import("Crypto.Cipher")
success &= check_import("Crypto.Util")

if success:
    print("\nAll required modules imported successfully!")
    sys.exit(0)
else:
    print("\nSome imports failed.")
    sys.exit(1)
