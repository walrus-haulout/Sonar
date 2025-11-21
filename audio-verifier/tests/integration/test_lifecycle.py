"""Lifecycle tests for verification session management."""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_get_session_status_processing(test_client, bearer_token, fake_session_store):
    """Test polling session while processing."""
    # Create a session
    session_id = await fake_session_store.create_session(
        "verification-id-123", {}
    )
    await fake_session_store.update_stage(session_id, "quality_check", 0.2)

    response = await test_client.get(
        f"/verify/{session_id}",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert data["status"] == "processing"
    assert data["stage"] == "quality_check"
    assert data["progress"] == 0.2


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_get_session_status_completed(test_client, bearer_token, fake_session_store):
    """Test polling completed session."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )
    result = {
        "approved": True,
        "quality_score": 0.9,
        "copyright_check": {"matches": []},
        "transcription": "Test transcription"
    }
    await fake_session_store.mark_completed(session_id, result)

    response = await test_client.get(
        f"/verify/{session_id}",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["result"] is not None


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_get_session_status_failed(test_client, bearer_token, fake_session_store):
    """Test polling failed session."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )
    await fake_session_store.mark_failed(session_id, "Audio quality too low")

    response = await test_client.get(
        f"/verify/{session_id}",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "failed"
    assert data["error"] == "Audio quality too low"


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_get_nonexistent_session(test_client, bearer_token):
    """Test polling nonexistent session."""
    response = await test_client.get(
        "/verify/nonexistent-id",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 404


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_stage_progression_order(test_client, bearer_token, fake_session_store):
    """Test that stages progress in correct order."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )

    expected_stages = [
        "quality_check",
        "copyright_check",
        "transcription",
        "analysis",
        "aggregation",
        "finalization"
    ]

    # Simulate progression through stages
    for i, stage in enumerate(expected_stages):
        progress = (i + 1) / len(expected_stages)
        await fake_session_store.update_stage(session_id, stage, progress)

    # Verify transitions were recorded
    transitions = fake_session_store.get_stage_transitions(session_id)
    assert len(transitions) == len(expected_stages)

    for i, transition in enumerate(transitions):
        assert transition.stage == expected_stages[i]
        assert abs(transition.progress - (i + 1) / len(expected_stages)) < 0.01


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_progress_monotonic_increasing(test_client, bearer_token, fake_session_store):
    """Test that progress increases monotonically."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )

    progress_values = [0.1, 0.2, 0.5, 0.8, 0.95, 1.0]

    for progress in progress_values:
        await fake_session_store.update_stage(session_id, "processing", progress)

    transitions = fake_session_store.get_stage_transitions(session_id)
    for i in range(len(transitions) - 1):
        assert transitions[i].progress <= transitions[i + 1].progress


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_cancel_session_success(test_client, bearer_token, fake_session_store):
    """Test canceling an active session."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )
    await fake_session_store.update_stage(session_id, "processing", 0.3)

    response = await test_client.post(
        f"/verify/{session_id}/cancel",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "cancelled"

    # Verify session is actually cancelled
    get_response = await test_client.get(
        f"/verify/{session_id}",
        headers={"Authorization": bearer_token}
    )
    assert get_response.json()["cancelled"] is True


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_cancel_nonexistent_session(test_client, bearer_token):
    """Test canceling nonexistent session."""
    response = await test_client.post(
        "/verify/nonexistent-id/cancel",
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 404


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_cancel_completed_session(test_client, bearer_token, fake_session_store):
    """Test canceling already completed session."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )
    await fake_session_store.mark_completed(session_id, {"approved": True})

    response = await test_client.post(
        f"/verify/{session_id}/cancel",
        headers={"Authorization": bearer_token}
    )

    # Should succeed but session already completed
    assert response.status_code in [200, 400]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_concurrent_sessions_isolation(test_client, bearer_token, fake_session_store):
    """Test that concurrent sessions don't interfere with each other."""
    # Create multiple sessions
    session_ids = []
    for i in range(3):
        session_id = await fake_session_store.create_session(
            f"verification-id-{i}", {}
        )
        session_ids.append(session_id)

    # Update each session to different stages
    stages = ["quality_check", "copyright_check", "transcription"]
    for session_id, stage in zip(session_ids, stages):
        await fake_session_store.update_stage(session_id, stage, 0.5)

    # Verify each session has correct state
    for session_id, expected_stage in zip(session_ids, stages):
        response = await test_client.get(
            f"/verify/{session_id}",
            headers={"Authorization": bearer_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["stage"] == expected_stage


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_polling_until_completion(test_client, bearer_token, fake_session_store):
    """Test realistic polling flow until completion."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )

    # Simulate pipeline stages
    stages = [
        ("quality_check", 0.15),
        ("copyright_check", 0.3),
        ("transcription", 0.5),
        ("analysis", 0.75),
        ("aggregation", 0.9),
    ]

    # Poll and update
    for stage, progress in stages:
        await fake_session_store.update_stage(session_id, stage, progress)

        response = await test_client.get(
            f"/verify/{session_id}",
            headers={"Authorization": bearer_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["progress"] <= 1.0

    # Complete
    final_result = {
        "approved": True,
        "quality_score": 0.85,
        "copyright_check": {"matches": []},
        "transcription": "Test",
        "analysis": {"quality_score": 0.8}
    }
    await fake_session_store.mark_completed(session_id, final_result)

    response = await test_client.get(
        f"/verify/{session_id}",
        headers={"Authorization": bearer_token}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["progress"] == 1.0
    assert data["result"] is not None


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_cancel_without_auth(test_client, fake_session_store):
    """Test cancel endpoint requires authentication."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )

    response = await test_client.post(f"/verify/{session_id}/cancel")
    assert response.status_code == 401


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_get_status_without_auth(test_client, fake_session_store):
    """Test get status endpoint requires authentication."""
    session_id = await fake_session_store.create_session(
        "verification-id", {}
    )

    response = await test_client.get(f"/verify/{session_id}")
    assert response.status_code == 401
