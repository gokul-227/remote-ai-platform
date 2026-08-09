"""LIVE WebSocket E2E test - runs against the running local Docker stack."""
import asyncio
import json
import os
import uuid

import httpx
import websockets

API = os.getenv("API_URL", "http://localhost:8000")
API_V1 = f"{API}/api/v1"
WS_BASE = os.getenv("WS_URL", "ws://localhost:8000/api/v1")


async def register(client: httpx.AsyncClient, email: str, role: str) -> dict:
    r = await client.post(
        f"{API_V1}/auth/register",
        json={"email": email, "password": "websocket-e2e-pass-123",
              "full_name": email.split("@")[0].replace(".", " ").title(),
              "role": role},
    )
    assert r.status_code == 200, f"register {email}: {r.status_code} {r.text}"
    return r.json()


async def main() -> None:
    suffix = uuid.uuid4().hex[:8]
    user_a_email = f"ws-a-{suffix}@example.com"
    user_b_email = f"ws-b-{suffix}@example.com"

    async with httpx.AsyncClient(timeout=30) as client:
        a = await register(client, user_a_email, "ENGINEER")
        b = await register(client, user_b_email, "COMPANY")
        a_headers = {"Authorization": f"Bearer {a['access_token']}"}
        b_headers = {"Authorization": f"Bearer {b['access_token']}"}
        print(f"[1/8] Registered A={a['user']['id']} B={b['user']['id']}")

        r = await client.post(f"{API_V1}/connections", headers=a_headers,
                              json={"receiver_id": b["user"]["id"]})
        assert r.status_code == 201, f"connection: {r.status_code} {r.text}"
        conn_id = r.json()["id"]
        print(f"[2/8] Connection created {conn_id}")

        r = await client.patch(f"{API_V1}/connections/{conn_id}",
                               headers=b_headers, json={"status": "ACCEPTED"})
        assert r.status_code == 200, f"accept: {r.status_code} {r.text}"
        print("[3/8] Connection accepted")

        r = await client.post(f"{API_V1}/conversations", headers=a_headers,
                              json={"participant_id": b["user"]["id"]})
        assert r.status_code == 201, f"conversation: {r.status_code} {r.text}"
        conversation_id = r.json()["id"]
        print(f"[4/8] Conversation created {conversation_id}")

        ws_url = f"{WS_BASE}/messages/ws/{conversation_id}"
        async with websockets.connect(f"{ws_url}?token={a['access_token']}") as ws_a, \
                   websockets.connect(f"{ws_url}?token={b['access_token']}") as ws_b:
            print("[5/8] Both WebSockets connected")

            sent_content = f"Hello over WebSocket! {suffix}"
            await ws_a.send(json.dumps({"content": sent_content}))
            print(f"[6/8] A sent: {sent_content!r}")

            received = json.loads(await asyncio.wait_for(ws_b.recv(), timeout=10))
            assert received["content"] == sent_content, f"content mismatch: {received!r}"
            assert received["sender_id"] == a["user"]["id"], f"sender mismatch: {received!r}"
            message_id = received["id"]
            print(f"[7/8] B received real-time message {message_id}")

        r = await client.get(f"{API_V1}/conversations/{conversation_id}/messages",
                             headers=b_headers)
        assert r.status_code == 200, f"history: {r.status_code} {r.text}"
        history = r.json()
        assert any(msg["content"] == sent_content and msg["id"] == message_id
                   for msg in history), f"message not in history: {history!r}"
        print(f"[8/8] Message persisted ({len(history)} message(s) in history)")

    print("\nWEBSOCKET E2E PASSED - real-time delivery + persistence verified")


if __name__ == "__main__":
    asyncio.run(main())