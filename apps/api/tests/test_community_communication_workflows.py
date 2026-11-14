"""Multi-user moderation and Files attachment boundaries."""
import uuid
from datetime import UTC, datetime

from test_channels import _connect, _user

from app.domains.files.models import FileNode, FileShare


async def test_approval_decline_and_ban_boundaries(client):
    owner, oh = await _user(client)
    applicant, ah = await _user(client)
    _, outsider = await _user(client)
    g = (await client.post("/api/v1/groups", headers=oh, json={"name": "Private community", "is_private": True})).json()
    base = f"/api/v1/groups/{g['id']}"
    assert (await client.post(base + "/join", headers=ah)).json()["status"] == "pending"
    assert (await client.get(base + "/membership-requests", headers=outsider)).status_code == 403
    assert (await client.patch(base + f"/members/{applicant}/status", headers=ah, json={"status": "active"})).status_code == 403
    queue = (await client.get(base + "/membership-requests", headers=oh)).json()
    assert len(queue) == 1
    assert "email" not in (queue[0]["member"] or {})
    assert (await client.delete(base + f"/membership-requests/{applicant}", headers=oh)).status_code == 204
    await client.post(base + "/join", headers=ah)
    for _ in range(2):
        assert (await client.patch(base + f"/members/{applicant}/status", headers=oh, json={"status": "active"})).status_code == 200
    assert (await client.get(base, headers=oh)).json()["member_count"] == 2
    assert (await client.delete(base + f"/membership-requests/{applicant}", headers=oh)).status_code == 409
    assert (await client.get(base + "/members", headers=ah, params={"member_status": "banned"})).status_code == 403
    assert (await client.patch(base + f"/members/{owner}/status", headers=oh, json={"status": "banned"})).status_code == 409
    await client.patch(base + f"/members/{applicant}/status", headers=oh, json={"status": "banned"})
    assert (await client.get(base + "/posts", headers=ah)).status_code == 403
    assert (await client.post(base + "/leave", headers=ah)).status_code == 403
    assert (await client.get(base + "/members", headers=oh, params={"member_status": "banned"})).json()[0]["user_id"] == str(applicant)
    assert (await client.patch(base + f"/members/{applicant}/status", headers=oh, json={"status": "active"})).json()["role"] == "member"


async def test_thread_and_attachment_access_follows_files(client, db, monkeypatch):
    owner, oh = await _user(client)
    member, mh = await _user(client)
    _, outsider = await _user(client)
    await _connect(db, owner, member)
    cid = (await client.post("/api/v1/channels", headers=oh, json={"kind": "GROUP", "name": "Files", "member_ids": [str(member)]})).json()["id"]
    base = f"/api/v1/channels/{cid}"
    node = FileNode(owner_id=owner, kind="file", name="private.txt", mime="text/plain", size=5, object_key="private/key", current_version=1)
    db.add(node)
    await db.commit()
    mid = (await client.post(base + "/messages", headers=oh, json={"body": "Review", "attachment_ids": [str(node.id)]})).json()["id"]
    assert (await client.get(base + "/messages", headers=mh)).json()[0]["attachments"] == []
    download = base + f"/messages/{mid}/attachments/{node.id}/download"
    assert (await client.get(download, headers=mh)).status_code == 404
    assert (await client.post(base + "/messages", headers=mh, json={"body": "stolen", "attachment_ids": [str(node.id)]})).status_code == 404
    grant = FileShare(node_id=node.id, principal_type="user", principal_id=member, role="viewer", created_by=owner)
    db.add(grant)
    await db.commit()
    visible = (await client.get(base + "/messages", headers=mh)).json()[0]["attachments"]
    assert visible[0]["name"] == "private.txt"
    assert "object_key" not in visible[0]
    monkeypatch.setattr("app.domains.files.router.generate_presigned_url", lambda *a, **k: "https://storage.test/signed")
    assert (await client.get(download, headers=mh)).status_code == 200
    reply = (await client.post(base + "/messages", headers=mh, json={"body": "Reply", "parent_id": mid})).json()
    threads = (await client.get(base + "/threads", headers=mh)).json()
    assert [t["id"] for t in threads] == [mid]
    assert threads[0]["reply_count"] == 1
    assert (await client.get(base + "/threads", headers=outsider)).status_code == 404
    assert (await client.get(base + "/messages", headers=mh, params={"thread": reply["id"]})).status_code == 422
    assert (await client.get(base + "/messages", headers=mh, params={"thread": str(uuid.uuid4())})).status_code == 404
    await db.delete(grant)
    await db.commit()
    assert (await client.get(download, headers=mh)).status_code == 404
    node.trashed_at = datetime.now(UTC)
    await db.commit()
    assert (await client.get(download, headers=oh)).status_code == 404
    assert (await client.post(base + "/messages", headers=oh, json={"body": "trash", "attachment_ids": [str(node.id)]})).status_code == 404
    node.trashed_at = None
    await db.commit()
    await client.delete(base + f"/messages/{mid}", headers=oh)
    assert (await client.get(download, headers=oh)).status_code == 404
    assert (await client.get(base + "/threads", headers=oh)).json()[0]["attachments"] == []
    await client.delete(base + f"/members/{member}", headers=oh)
    assert (await client.get(base + "/threads", headers=mh)).status_code == 404


async def test_dm_attachment_permissions_and_revocation(client, db, monkeypatch):
    from app.domains.network.models import UserBlock

    owner, oh = await _user(client)
    recipient, rh = await _user(client)
    third, outsider = await _user(client)
    cid = (await client.post("/api/v1/conversations", headers=oh, json={"participant_id": str(recipient)})).json()["id"]
    base = f"/api/v1/conversations/{cid}/messages"
    file = FileNode(owner_id=owner, kind="file", name="secret.txt", mime="text/plain", size=7, current_version=1, object_key="secret/key")
    folder = FileNode(owner_id=owner, kind="folder", name="Folder")
    db.add_all([file, folder])
    await db.commit()
    body = {"content": "Review", "attachment_ids": [str(file.id)]}
    assert (await client.post(base, headers=outsider, json=body)).status_code == 404
    assert (await client.post(base, headers=rh, json=body)).status_code == 404
    assert (await client.post(base, headers=oh, json={"content": "folder", "attachment_ids": [str(folder.id)]})).status_code == 404
    sent = (await client.post(base, headers=oh, json=body)).json()
    assert sent["attachments"][0]["name"] == "secret.txt"
    assert "object_key" not in sent["attachments"][0]
    assert "attachment_ids" not in sent
    mid = sent["id"]
    download = base + f"/{mid}/attachments/{file.id}/download"
    assert (await client.get(base, headers=rh)).json()[0]["attachments"] == []
    assert (await client.get(download, headers=rh)).status_code == 404
    grant = FileShare(node_id=file.id, principal_type="user", principal_id=recipient, role="viewer", created_by=owner)
    db.add(grant)
    await db.commit()
    monkeypatch.setattr("app.domains.files.router.generate_presigned_url", lambda *a, **k: "https://storage.test/signed")
    assert (await client.get(download, headers=rh)).status_code == 200
    assert (await client.get(download, headers=outsider)).status_code == 404
    other = (await client.post("/api/v1/conversations", headers=rh, json={"participant_id": str(third)})).json()["id"]
    assert (await client.get(f"/api/v1/conversations/{other}/messages/{mid}/attachments/{file.id}/download", headers=rh)).status_code == 404
    grant.expires_at = datetime(2000, 1, 1, tzinfo=UTC)
    await db.commit()
    assert (await client.get(download, headers=rh)).status_code == 404
    grant.expires_at = None
    file.parent_id = folder.id
    folder.trashed_at = datetime.now(UTC)
    await db.commit()
    assert (await client.get(download, headers=oh)).status_code == 404
    folder.trashed_at = None
    db.add(UserBlock(blocker_id=recipient, blocked_id=owner))
    await db.commit()
    assert (await client.get(download, headers=rh)).status_code == 403
    assert (await client.post(base, headers=oh, json=body)).status_code == 403


async def test_private_pending_status_and_cancel_are_self_scoped(client):
    _, oh = await _user(client)
    applicant, ah = await _user(client)
    _, outsider = await _user(client)
    group = (await client.post("/api/v1/groups", headers=oh, json={"name": "Secret community", "is_private": True})).json()
    base = f"/api/v1/groups/{group['id']}"
    assert (await client.get(base + "/membership", headers=ah)).json() == {"status": None}
    assert (await client.get(base, headers=ah)).status_code == 403
    await client.post(base + "/join", headers=ah)
    assert (await client.get(base + "/membership", headers=ah)).json() == {"status": "pending"}
    assert (await client.get(base + "/membership", headers=outsider)).json() == {"status": None}
    assert (await client.get(base + "/posts", headers=ah)).status_code == 403
    assert (await client.get(base + "/members", headers=ah)).status_code == 403
    assert (await client.post(base + "/join", headers=ah)).status_code == 409
    await client.post(base + "/leave", headers=ah)
    assert (await client.get(base + "/membership", headers=ah)).json() == {"status": None}
    assert (await client.get(base, headers=oh)).json()["member_count"] == 1
    await client.post(base + "/join", headers=ah)
    await client.patch(base + f"/members/{applicant}/status", headers=oh, json={"status": "active"})
    assert (await client.get(base + "/membership", headers=ah)).json() == {"status": "active"}
    assert (await client.get(base, headers=ah)).status_code == 200
    assert (await client.get(f"/api/v1/groups/{uuid.uuid4()}/membership", headers=ah)).status_code == 404
