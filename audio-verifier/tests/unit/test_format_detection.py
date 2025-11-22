"""Unit tests for audio format detection functions in main.py."""

import pytest
from unittest.mock import patch


def test_check_riff_header_valid_wav():
    """Test WAV header detection with valid RIFF/WAVE header."""
    from main import _check_riff_header
    # Valid WAV header: RIFF + size + WAVE
    data = b'RIFF' + b'\x00\x00\x00\x00' + b'WAVE' + b'\x00' * 100
    assert _check_riff_header(data) is True


def test_check_riff_header_invalid_riff():
    """Test WAV header detection rejects invalid RIFF header."""
    from main import _check_riff_header
    data = b'FILE' + b'\x00\x00\x00\x00' + b'WAVE'
    assert _check_riff_header(data) is False


def test_check_riff_header_invalid_wave():
    """Test WAV header detection rejects invalid WAVE identifier."""
    from main import _check_riff_header
    data = b'RIFF' + b'\x00\x00\x00\x00' + b'AUDIO'
    assert _check_riff_header(data) is False


def test_check_riff_header_too_short():
    """Test WAV header detection requires minimum 12 bytes."""
    from main import _check_riff_header
    data = b'RIFF' + b'\x00\x00'  # Only 6 bytes
    assert _check_riff_header(data) is False


def test_looks_like_mp3_with_id3_tag():
    """Test MP3 detection with ID3v2 tag."""
    from main import _looks_like_mp3
    data = b'ID3' + b'\x00' * 100
    assert _looks_like_mp3(data) is True


def test_looks_like_mp3_with_mpeg_sync():
    """Test MP3 detection with MPEG frame sync (0xFFE0)."""
    from main import _looks_like_mp3
    data = bytes([0xFF, 0xE0]) + b'\x00' * 100
    assert _looks_like_mp3(data) is True


def test_looks_like_mp3_with_mpeg_sync_ffe4():
    """Test MP3 detection with MPEG frame sync (0xFFE4)."""
    from main import _looks_like_mp3
    data = bytes([0xFF, 0xE4]) + b'\x00' * 100
    assert _looks_like_mp3(data) is True


def test_looks_like_mp3_invalid():
    """Test MP3 detection rejects invalid data."""
    from main import _looks_like_mp3
    data = b'NOT_MP3' + b'\x00' * 100
    assert _looks_like_mp3(data) is False


def test_looks_like_mp3_too_short():
    """Test MP3 detection requires minimum 2 bytes."""
    from main import _looks_like_mp3
    data = b'A'
    assert _looks_like_mp3(data) is False


def test_check_flac_header_valid():
    """Test FLAC header detection with valid fLaC header."""
    from main import _check_flac_header
    data = b'fLaC' + b'\x00' * 100
    assert _check_flac_header(data) is True


def test_check_flac_header_invalid():
    """Test FLAC header detection rejects invalid header."""
    from main import _check_flac_header
    data = b'FLAC' + b'\x00' * 100
    assert _check_flac_header(data) is False


def test_check_flac_header_too_short():
    """Test FLAC header detection requires minimum 4 bytes."""
    from main import _check_flac_header
    data = b'fLa'
    assert _check_flac_header(data) is False


def test_check_ogg_header_valid():
    """Test OGG header detection with valid OggS header."""
    from main import _check_ogg_header
    data = b'OggS' + b'\x00' * 100
    assert _check_ogg_header(data) is True


def test_check_ogg_header_invalid():
    """Test OGG header detection rejects invalid header."""
    from main import _check_ogg_header
    data = b'Ogg ' + b'\x00' * 100
    assert _check_ogg_header(data) is False


def test_check_ogg_header_too_short():
    """Test OGG header detection requires minimum 4 bytes."""
    from main import _check_ogg_header
    data = b'Ogg'
    assert _check_ogg_header(data) is False


def test_check_m4a_header_with_ftypM4A():
    """Test M4A header detection with ftypM4A variant."""
    from main import _check_m4a_header
    data = b'\x00' * 4 + b'ftypM4A ' + b'\x00' * 100
    assert _check_m4a_header(data) is True


def test_check_m4a_header_with_ftypmp42():
    """Test M4A header detection with ftypmp42 variant."""
    from main import _check_m4a_header
    data = b'\x00' * 4 + b'ftypmp42' + b'\x00' * 100
    assert _check_m4a_header(data) is True


def test_check_m4a_header_with_ftypisom():
    """Test M4A header detection with ftypisom variant."""
    from main import _check_m4a_header
    data = b'\x00' * 4 + b'ftypisom' + b'\x00' * 100
    assert _check_m4a_header(data) is True


def test_check_m4a_header_with_ftypmp41():
    """Test M4A header detection with ftypmp41 variant."""
    from main import _check_m4a_header
    data = b'\x00' * 4 + b'ftypmp41' + b'\x00' * 100
    assert _check_m4a_header(data) is True


def test_check_m4a_header_invalid_ftyp():
    """Test M4A header detection rejects invalid ftyp variant."""
    from main import _check_m4a_header
    data = b'\x00' * 4 + b'ftypXXXX' + b'\x00' * 100
    assert _check_m4a_header(data) is False


def test_check_m4a_header_no_ftyp():
    """Test M4A header detection rejects data without ftyp."""
    from main import _check_m4a_header
    data = b'\x00' * 100
    assert _check_m4a_header(data) is False


def test_check_m4a_header_too_short():
    """Test M4A header detection requires minimum 12 bytes."""
    from main import _check_m4a_header
    data = b'\x00' * 8
    assert _check_m4a_header(data) is False


def test_check_webm_header_valid():
    """Test WebM header detection with valid EBML header."""
    from main import _check_webm_header
    data = b'\x1a\x45\xdf\xa3' + b'\x00' * 100
    assert _check_webm_header(data) is True


def test_check_webm_header_invalid():
    """Test WebM header detection rejects invalid header."""
    from main import _check_webm_header
    data = b'\x1a\x45\xdf\xa4' + b'\x00' * 100
    assert _check_webm_header(data) is False


def test_check_webm_header_too_short():
    """Test WebM header detection requires minimum 4 bytes."""
    from main import _check_webm_header
    data = b'\x1a\x45'
    assert _check_webm_header(data) is False


def test_check_3gp_header_with_ftyp3gp():
    """Test 3GP header detection with ftyp3gp variant."""
    from main import _check_3gp_header
    data = b'\x00' * 4 + b'ftyp3gp ' + b'\x00' * 100
    assert _check_3gp_header(data) is True


def test_check_3gp_header_with_ftyp3g2():
    """Test 3GP header detection with ftyp3g2 variant."""
    from main import _check_3gp_header
    data = b'\x00' * 4 + b'ftyp3g2 ' + b'\x00' * 100
    assert _check_3gp_header(data) is True


def test_check_3gp_header_invalid():
    """Test 3GP header detection rejects invalid header."""
    from main import _check_3gp_header
    data = b'\x00' * 4 + b'ftypmp4v' + b'\x00' * 100
    assert _check_3gp_header(data) is False


def test_check_3gp_header_too_short():
    """Test 3GP header detection requires minimum 12 bytes."""
    from main import _check_3gp_header
    data = b'\x00' * 8
    assert _check_3gp_header(data) is False


def test_check_amr_header_valid_amr_nb():
    """Test AMR header detection with AMR-NB header."""
    from main import _check_amr_header
    data = b'#!AMR' + b'\x00' * 100
    assert _check_amr_header(data) is True


def test_check_amr_header_valid_amr_wb():
    """Test AMR header detection with AMR-WB header."""
    from main import _check_amr_header
    data = b'#!AMR-WB' + b'\x00' * 100
    assert _check_amr_header(data) is True


def test_check_amr_header_invalid():
    """Test AMR header detection rejects invalid header."""
    from main import _check_amr_header
    data = b'#!OPU' + b'\x00' * 100
    assert _check_amr_header(data) is False


def test_check_amr_header_too_short():
    """Test AMR header detection requires minimum 5 bytes."""
    from main import _check_amr_header
    data = b'#!AM'
    assert _check_amr_header(data) is False


def test_detect_audio_format_wav():
    """Test format detection identifies WAV."""
    from main import _detect_audio_format
    data = b'RIFF' + b'\x00\x00\x00\x00' + b'WAVE' + b'\x00' * 100
    assert _detect_audio_format(data) == 'WAV'


def test_detect_audio_format_mp3_id3():
    """Test format detection identifies MP3 with ID3 tag."""
    from main import _detect_audio_format
    data = b'ID3' + b'\x00' * 100
    assert _detect_audio_format(data) == 'MP3'


def test_detect_audio_format_mp3_sync():
    """Test format detection identifies MP3 with MPEG sync."""
    from main import _detect_audio_format
    data = bytes([0xFF, 0xE0]) + b'\x00' * 100
    assert _detect_audio_format(data) == 'MP3'


def test_detect_audio_format_flac():
    """Test format detection identifies FLAC."""
    from main import _detect_audio_format
    data = b'fLaC' + b'\x00' * 100
    assert _detect_audio_format(data) == 'FLAC'


def test_detect_audio_format_ogg():
    """Test format detection identifies OGG/Opus."""
    from main import _detect_audio_format
    data = b'OggS' + b'\x00' * 100
    assert _detect_audio_format(data) == 'OGG/Opus'


def test_detect_audio_format_m4a():
    """Test format detection identifies M4A/MP4."""
    from main import _detect_audio_format
    data = b'\x00' * 4 + b'ftypM4A ' + b'\x00' * 100
    assert _detect_audio_format(data) == 'M4A/MP4'


def test_detect_audio_format_webm():
    """Test format detection identifies WebM."""
    from main import _detect_audio_format
    data = b'\x1a\x45\xdf\xa3' + b'\x00' * 100
    assert _detect_audio_format(data) == 'WebM'


def test_detect_audio_format_3gp():
    """Test format detection identifies 3GP."""
    from main import _detect_audio_format
    data = b'\x00' * 4 + b'ftyp3gp ' + b'\x00' * 100
    assert _detect_audio_format(data) == '3GP'


def test_detect_audio_format_amr():
    """Test format detection identifies AMR."""
    from main import _detect_audio_format
    data = b'#!AMR' + b'\x00' * 100
    assert _detect_audio_format(data) == 'AMR'


def test_detect_audio_format_unknown():
    """Test format detection returns unknown for unrecognized format."""
    from main import _detect_audio_format
    data = b'UNKNOWN' + b'\x00' * 100
    assert _detect_audio_format(data) == 'unknown'


def test_detect_audio_format_priority_wav_over_mp3():
    """Test format detection prioritizes WAV over other formats."""
    from main import _detect_audio_format
    # Create data that could match both WAV and another format
    data = b'RIFF' + b'\x00\x00\x00\x00' + b'WAVE' + b'\x00' * 100
    assert _detect_audio_format(data) == 'WAV'


def test_detect_audio_format_priority_mp3_over_flac():
    """Test format detection checks MP3 before FLAC."""
    from main import _detect_audio_format
    # Create data with MP3 header
    data = b'ID3' + b'\x00' * 100
    assert _detect_audio_format(data) == 'MP3'


def test_detect_audio_format_empty_data():
    """Test format detection handles empty data."""
    from main import _detect_audio_format
    data = b''
    assert _detect_audio_format(data) == 'unknown'


def test_detect_audio_format_minimal_data():
    """Test format detection handles minimal data."""
    from main import _detect_audio_format
    data = b'\x00'
    assert _detect_audio_format(data) == 'unknown'
