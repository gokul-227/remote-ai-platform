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


@pytest.mark.asyncio
async def test_lists_embed_other_user_summary_unread_and_last_message(client: AsyncClient):
    a_token, a_id = await register(client, "summary-a@example.com")
    b_token, b_id = await register(client, "summary-b@example.com")
    a = {"Authorization": f"Bearer {a_token}"}
    b = {"Authorization": f"Bearer {b_token}"}

    await client.post("/api/v1/connections", headers=a, json={"receiver_id": b_id})
    pending = await client.get("/api/v1/connections", headers=b, params={"status": "PENDING"})
    assert pending.status_code == 200
    [conn] = pending.json()
    assert conn["status"] == "PENDING"
    assert conn["sender"]["full_name"] == "summary-a"
    assert conn["receiver"]["id"] == b_id
    # Other users' emails must never leak through these summaries.
    assert "email" not in conn["sender"] and "email" not in conn["receiver"]
    assert (await client.get("/api/v1/connections", headers=b, params={"status": "ACCEPTED"})).json() == []

    conv_id = (await client.post("/api/v1/conversations", headers=a, json={"participant_id": b_id})).json()["id"]
    await client.post(f"/api/v1/conversations/{conv_id}/messages", headers=a, json={"content": "first"})
    await client.post(f"/api/v1/conversations/{conv_id}/messages", headers=a, json={"content": "second"})

    [conv] = (await client.get("/api/v1/conversations", headers=b)).json()
    assert conv["other_participant"]["full_name"] == "summary-a"
    assert conv["unread_count"] == 2
    assert conv["last_message"]["content"] in {"first", "second"}
    assert (await client.get("/api/v1/conversations/unread-count", headers=b)).json() == {"count": 2}
    # The sender's own messages are never unread for them.
    assert (await client.get("/api/v1/conversations/unread-count", headers=a)).json() == {"count": 0}

    # Opening the conversation marks the other party's messages read.
    await client.get(f"/api/v1/conversations/{conv_id}/messages", headers=b)
    assert (await client.get("/api/v1/conversations/unread-count", headers=b)).json() == {"count": 0}
