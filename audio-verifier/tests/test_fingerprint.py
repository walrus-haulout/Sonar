import asyncio
from types import SimpleNamespace

import acoustid
import pytest

from fingerprint import CopyrightDetector


@pytest.mark.asyncio
async def test_copyright_detector_uses_fingerprint_file(monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"fake-audio")

    called = SimpleNamespace(fingerprint=False, lookup=False)

    def fake_fingerprint(path: str):
        called.fingerprint = path
        return 123, "fingerprint-data"

    def fake_lookup(api_key: str, fingerprint: str, duration: int, parse: bool = True):
        called.lookup = (api_key, fingerprint, duration, parse)
        yield (0.93, "recording", "Title", "Artist")

    monkeypatch.setattr(acoustid, "fingerprint_file", fake_fingerprint)
    monkeypatch.setattr(acoustid, "lookup", fake_lookup)

    detector = CopyrightDetector("api-key")
    result = await detector.check_copyright_from_path(str(audio_path))

    assert called.fingerprint == str(audio_path)
    assert called.lookup[0] == "api-key"
    assert result["copyright"]["detected"] is True
    assert result["copyright"]["matches"][0]["title"] == "Title"


@pytest.mark.asyncio
async def test_copyright_detector_handles_missing_backend(monkeypatch, tmp_path):
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"fake-audio")

    def raise_backend(_):
        raise acoustid.NoBackendError("missing fpcalc")

    monkeypatch.setattr(acoustid, "fingerprint_file", raise_backend)

    detector = CopyrightDetector("api-key")
    result = await detector.check_copyright_from_path(str(audio_path))

    assert result["copyright"]["checked"] is False
    assert "Chromaprint not installed" in result["copyright"]["error"]





