"""Private folder organization for existing Office documents; content stays in documents."""
import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FileFolder(Base):
    __tablename__ = "file_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("file_folders.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    trash_batch: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)


class FileLocation(Base):
    __tablename__ = "file_locations"

    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("file_folders.id", ondelete="SET NULL"), index=True)
    trash_batch: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
