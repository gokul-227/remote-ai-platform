"""Check a submitted commit against GitHub's public API.

Only the fixed host api.github.com is ever called, with the owner/repo parsed
from an already-validated https://github.com/<owner>/<repo> URL, so a user can't
point the server at another address. No token is sent: a private repository
looks the same as a missing commit, which is reported as such, never as fake.
"""

import httpx

GITHUB_API = "https://api.github.com"
TIMEOUT = httpx.Timeout(5.0)


async def check_commit(repo_url: str, sha: str) -> str:
    owner_repo = repo_url.removeprefix("https://github.com/").strip("/")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            res = await client.get(
                f"{GITHUB_API}/repos/{owner_repo}/commits/{sha}",
                headers={"Accept": "application/vnd.github+json", "User-Agent": "remote-ai-platform"},
            )
    except httpx.HTTPError:
        return "UNVERIFIED"
    if res.status_code == 200:
        return "VERIFIED"
    if res.status_code in (404, 422):
        return "NOT_FOUND"
    # Rate limits or GitHub trouble: say we couldn't check rather than guessing.
    return "UNVERIFIED"
