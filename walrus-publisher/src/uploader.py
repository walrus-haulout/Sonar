import httpx
import asyncio
from typing import Optional, Dict, Any
from config.platform import Config


class WalrusUploader:
    def __init__(self, publisher_url: str = Config.WALRUS_PUBLISHER_URL):
        self.publisher_url = publisher_url
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self.client = httpx.AsyncClient(timeout=300.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()

    async def upload_chunk(
        self,
        chunk_data: bytes,
        chunk_index: int,
    ) -> str:
        if not self.client:
            raise RuntimeError("Uploader not initialized. Use 'async with' context manager.")

        headers = {
            "Content-Type": "application/octet-stream",
        }

        try:
            response = await self.client.put(
                f"{self.publisher_url}/v1/blobs",
                content=chunk_data,
                headers=headers,
            )
            response.raise_for_status()

            # Walrus HTTP API returns blob_id in JSON
            # Response can be either:
            # { "newlyCreated": { "blobObject": { "blobId": "...", ... } } }
            # or { "alreadyCertified": { "blobId": "...", ... } }
            result: Any = response.json()
            blob_id: Optional[str] = None
            
            if "newlyCreated" in result:
                blob_object = result["newlyCreated"].get("blobObject", {})
                blob_id = blob_object.get("blobId") or blob_object.get("blob_id")
            elif "alreadyCertified" in result:
                blob_id = result["alreadyCertified"].get("blobId") or result["alreadyCertified"].get("blob_id")
            
            # Fallback to legacy format for backwards compatibility
            if not blob_id:
                blob_id = result.get("blobId") or result.get("blob_id")

            if not blob_id:
                raise ValueError(f"No blob_id in response: {result}")

            return blob_id

        except httpx.HTTPError as e:
            raise RuntimeError(f"Failed to upload chunk {chunk_index}: {e}")
