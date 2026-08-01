import pytest
from httpx import AsyncClient


async def register(client: AsyncClient, email: str, role: str = "ENGINEER") -> tuple[str, str]:
    response = await client.post("/api/v1/auth/register", json={"email": email, "password": "secure-pass", "full_name": email.split("@")[0], "role": role})
    body = response.json()
    return body["access_token"], body["user"]["id"]


@pytest.mark.asyncio
async def test_connection_conversation_messages_and_notifications(client: AsyncClient):
    sender_token, sender_id = await register(client, "network-sender@example.com")
    receiver_token, receiver_id = await register(client, "network-receiver@example.com", "COMPANY")
    sender_headers = {"Authorization": f"Bearer {sender_token}"}
    receiver_headers = {"Authorization": f"Bearer {receiver_token}"}

    connection = await client.post("/api/v1/connections", headers=sender_headers, json={"receiver_id": receiver_id})
    assert connection.status_code == 201
    connection_id = connection.json()["id"]
    accepted = await client.patch(f"/api/v1/connections/{connection_id}", headers=receiver_headers, json={"status": "ACCEPTED"})
    assert accepted.status_code == 200

    conversation = await client.post("/api/v1/conversations", headers=sender_headers, json={"participant_id": receiver_id})
    assert conversation.status_code == 201
    conversation_id = conversation.json()["id"]
    sent = await client.post(f"/api/v1/conversations/{conversation_id}/messages", headers=sender_headers, json={"content": "Hello from the marketplace."})
    assert sent.status_code == 201
    history = await client.get(f"/api/v1/conversations/{conversation_id}/messages", headers=receiver_headers)
    assert history.status_code == 200
    assert history.json()[0]["content"] == "Hello from the marketplace."

    notifications = await client.get("/api/v1/notifications", headers=receiver_headers)
    assert notifications.status_code == 200
    assert any(item["kind"] == "message" for item in notifications.json())
