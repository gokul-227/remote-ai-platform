"""Files remains the authority for communication attachment access."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.files.access import ancestors, effective_role
from app.domains.files.models import FileNode


async def accessible_file(db: AsyncSession, node_id: uuid.UUID, user: User) -> FileNode | None:
    node = await db.get(FileNode, node_id)
    if node is None or node.kind != "file" or not node.object_key:
        return None
    if any(n.trashed_at is not None for n in await ancestors(db, node)):
        return None
    return node if await effective_role(db, node, user) else None
