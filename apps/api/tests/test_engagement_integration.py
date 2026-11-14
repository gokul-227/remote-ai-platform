"""Engagement activation, task reviews, completion and persisted project demos."""

import uuid

import pytest
from httpx import AsyncClient


async def register(client, role):
    result = await client.post('/api/v1/auth/register', json={
        'email': f'engagement-{uuid.uuid4().hex}@test.com', 'password': 'Password123!',
        'full_name': role, 'role': role,
    })
    assert result.status_code == 200, result.text
    data = result.json()
    return {'Authorization': f"Bearer {data['access_token']}"}, data['user']['id']


async def engagement(client):
    company, _ = await register(client, 'COMPANY')
    worker, worker_id = await register(client, 'ENGINEER')
    assert (await client.post('/api/v1/companies/me', headers=company, json={'name': 'Lifecycle'})).status_code == 201
    project = await client.post('/api/v1/projects', headers=company, json={'title': 'Engagement', 'description': 'Scope'})
    assert project.status_code == 201, project.text
    pid = project.json()['id']
    result = await client.post('/api/v1/contracts', headers=company, json={
        'project_id': pid, 'worker_id': worker_id, 'title': 'Build',
        'scope_description': 'Deliver', 'rate_amount': 100,
        'milestones': [{'title': 'Delivery', 'amount': 100}],
    })
    assert result.status_code == 201, result.text
    return company, worker, worker_id, pid, result.json()


async def sign(client, company, worker, cid):
    for headers in (company, worker):
        result = await client.post(f'/api/v1/contracts/{cid}/sign', headers=headers)
        assert result.status_code == 200, result.text


@pytest.mark.asyncio
async def test_signed_contract_provisions_workspace_and_completes_after_reviews(client: AsyncClient):
    company, worker, wid, pid, contract = await engagement(client)
    cid, mid = contract['id'], contract['milestones'][0]['id']
    assert (await client.get(f'/api/v1/projects/{pid}/milestones', headers=worker)).status_code == 403
    await sign(client, company, worker, cid)
    milestones = await client.get(f'/api/v1/projects/{pid}/milestones', headers=worker)
    assert milestones.status_code == 200
    assert [m['contract_milestone_id'] for m in milestones.json()] == [mid]
    task = await client.post('/api/v1/projects/tasks', headers=company, json={
        'project_id': pid, 'title': 'Deliver', 'assigned_user_id': wid,
    })
    assert task.status_code == 201, task.text
    tid = task.json()['id']
    assert (await client.post(f'/api/v1/contracts/{cid}/complete', headers=worker)).status_code == 403
    assert (await client.post(f'/api/v1/contracts/{cid}/complete', headers=company)).status_code == 409
    for headers, state in ((worker, 'DELIVERED'), (company, 'APPROVED')):
        result = await client.patch(f'/api/v1/contracts/{cid}/milestones/{mid}/status', headers=headers, json={'status': state})
        assert result.status_code == 200, result.text
    assert (await client.post(f'/api/v1/contracts/{cid}/complete', headers=company)).status_code == 409
    submission = await client.post(f'/api/v1/projects/tasks/{tid}/submissions', headers=worker, json={'summary': 'Done', 'artifact_urls': []})
    assert submission.status_code == 201, submission.text
    sid = submission.json()['id']
    assert (await client.patch(f'/api/v1/projects/tasks/{tid}', headers=worker, json={'status': 'COMPLETED'})).status_code == 409
    assert (await client.patch(f'/api/v1/projects/tasks/{tid}', headers=worker, json={'assigned_user_id': None})).status_code == 403
    reviewed = await client.patch(f'/api/v1/projects/submissions/{sid}/review', headers=company, json={'status': 'CHANGES_REQUESTED', 'review_note': 'Fix'})
    assert reviewed.status_code == 200, reviewed.text
    revised = await client.post(f'/api/v1/projects/tasks/{tid}/submissions', headers=worker, json={'summary': 'Fixed'})
    assert revised.status_code == 201, revised.text
    # A superseded revision must never approve the current task.
    assert (await client.patch(f'/api/v1/projects/submissions/{sid}/review', headers=company, json={'status': 'APPROVED'})).status_code == 409
    approved = await client.patch(f"/api/v1/projects/submissions/{revised.json()['id']}/review", headers=company, json={'status': 'APPROVED'})
    assert approved.status_code == 200, approved.text
    for _ in range(2):
        completed = await client.post(f'/api/v1/contracts/{cid}/complete', headers=company)
        assert completed.status_code == 200, completed.text
        assert completed.json()['status'] == 'COMPLETED'
        assert completed.json()['milestones'][0]['status'] == 'APPROVED'
    assert (await client.post(f'/api/v1/contracts/{cid}/sign', headers=worker)).status_code == 409


@pytest.mark.asyncio
async def test_demo_registry_revision_authorization_and_completion_gate(client: AsyncClient):
    company, worker, _, pid, contract = await engagement(client)
    outsider, _ = await register(client, 'ENGINEER')
    cid, mid = contract['id'], contract['milestones'][0]['id']
    payload = {'contract_id': cid, 'milestone_id': mid, 'title': 'Preview', 'demo_url': 'https://demo.remoteai.dev', 'environment': 'staging'}
    path = f'/api/v1/projects/{pid}/demos'
    assert (await client.post(path, headers=worker, json=payload)).status_code == 409
    await sign(client, company, worker, cid)
    assert (await client.post(path, headers=company, json=payload)).status_code == 403
    created = await client.post(path, headers=worker, json=payload)
    assert created.status_code == 201, created.text
    did = created.json()['id']
    assert (await client.get(path, headers=outsider)).status_code == 404
    assert (await client.get(f'{path}/{did}/view', headers=outsider)).status_code == 404
    assert (await client.get(f'{path}/{did}/view', headers=company)).json()['mode'] == 'EXTERNAL'
    assert (await client.post(f'{path}/{did}/review', headers=worker, json={'decision': 'ACCEPTED'})).status_code == 403
    requested = await client.post(f'{path}/{did}/review', headers=company, json={'decision': 'CHANGES_REQUESTED', 'note': 'Fix styling'})
    assert requested.status_code == 200, requested.text
    revised = await client.post(path, headers=worker, json={**payload, 'supersedes_id': did})
    assert revised.status_code == 201, revised.text
    assert revised.json()['version'] == 2
    for headers, state in ((worker, 'DELIVERED'), (company, 'APPROVED')):
        assert (await client.patch(f'/api/v1/contracts/{cid}/milestones/{mid}/status', headers=headers, json={'status': state})).status_code == 200
    assert (await client.post(f'/api/v1/contracts/{cid}/complete', headers=company)).status_code == 409
    accepted = await client.post(f"{path}/{revised.json()['id']}/review", headers=company, json={'decision': 'ACCEPTED'})
    assert accepted.status_code == 200, accepted.text
    assert len((await client.get(path, headers=worker)).json()) == 2
    assert (await client.post(f'/api/v1/contracts/{cid}/complete', headers=company)).status_code == 200


@pytest.mark.asyncio
async def test_demo_registry_rejects_cross_project_and_unsafe_links(client: AsyncClient):
    company, worker, _, pid, contract = await engagement(client)
    await sign(client, company, worker, contract['id'])
    body = {'contract_id': contract['id'], 'milestone_id': contract['milestones'][0]['id'], 'title': 'Preview', 'demo_url': 'https://demo.remoteai.dev'}
    wrong = f'/api/v1/projects/{uuid.uuid4()}/demos'
    assert (await client.post(wrong, headers=worker, json=body)).status_code == 404
    path = f'/api/v1/projects/{pid}/demos'
    for unsafe in ('javascript:alert(1)', 'https://127.0.0.1/', 'https://user:password@remoteai.dev/'):
        assert (await client.post(path, headers=worker, json={**body, 'demo_url': unsafe})).status_code == 422
    demo = await client.post(path, headers=worker, json=body)
    did = demo.json()['id']
    assert (await client.post(f'{path}/{did}/withdraw', headers=worker)).status_code == 200
    assert (await client.get(f'{path}/{did}/view', headers=company)).status_code == 409
