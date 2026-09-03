"""
Social Feed Router — posts, likes, comments, and feed endpoints.

Follows the domain pattern: models → schemas → repository → service → router.
Feed is deterministic (connection + self posts, recency-sorted) — ML ranking
can be introduced later via the feed algorithm abstraction.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.network.models import Connection
from app.domains.social.models import Post, PostComment, PostLike
from app.domains.social.schemas import (
    AuthorSummary,
    CommentCreate,
    CommentResponse,
    FeedResponse,
    PostCreate,
    PostResponse,
    PostUpdate,
)

router = APIRouter(prefix="/social", tags=["Social Feed"])


# ── Helpers ────────────────────────────────────────────────────────────────────


def _author_summary(user: User) -> AuthorSummary:
    return AuthorSummary(
        id=user.id,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
    )


async def _get_post_or_404(post_id: uuid.UUID, db: AsyncSession) -> Post:
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


async def _get_visible_post_or_404(post_id: uuid.UUID, current_user_id: uuid.UUID, db: AsyncSession) -> Post:
    """Like _get_post_or_404, but also enforces the post's own visibility —
    a PRIVATE or CONNECTIONS-only post must not be readable/likeable/
    commentable by a direct post_id lookup just because get_feed's own
    visibility filter was bypassed. Returns 404 rather than 403 either way
    so a caller can't distinguish "doesn't exist" from "not visible to you"."""
    post = await _get_post_or_404(post_id, db)
    if post.author_id == current_user_id or post.visibility == "PUBLIC":
        return post
    if post.visibility == "CONNECTIONS":
        connected = await db.scalar(
            select(Connection).where(
                or_(
                    (Connection.sender_id == current_user_id) & (Connection.receiver_id == post.author_id),
                    (Connection.sender_id == post.author_id) & (Connection.receiver_id == current_user_id),
                ),
                Connection.status == "ACCEPTED",
            )
        )
        if connected:
            return post
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


async def _enrich_posts(
    posts: list[Post],
    current_user_id: uuid.UUID,
    db: AsyncSession,
) -> list[PostResponse]:
    """Attach author summary and liked_by_me flag to posts."""
    if not posts:
        return []

    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    # Fetch all authors at once
    author_result = await db.execute(select(User).where(User.id.in_(author_ids)))
    authors = {u.id: u for u in author_result.scalars().all()}

    # Fetch likes by current user for these posts
    liked_result = await db.execute(
        select(PostLike.post_id).where(
            PostLike.post_id.in_(post_ids),
            PostLike.user_id == current_user_id,
        )
    )
    liked_set = set(liked_result.scalars().all())

    enriched = []
    for post in posts:
        author = authors.get(post.author_id)
        enriched.append(
            PostResponse(
                id=post.id,
                author_id=post.author_id,
                author=_author_summary(author) if author else None,
                content=post.content,
                image_url=post.image_url,
                link_url=post.link_url,
                link_preview_title=post.link_preview_title,
                visibility=post.visibility,
                like_count=post.like_count,
                comment_count=post.comment_count,
                liked_by_me=post.id in liked_set,
                created_at=post.created_at,
                updated_at=post.updated_at,
            )
        )
    return enriched


# ── Feed ───────────────────────────────────────────────────────────────────────


@router.get("/feed", response_model=FeedResponse, summary="Get personalized feed")
async def get_feed(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    """
    Return a paginated feed of posts from:
    - the current user's own posts
    - users the current user is connected to (ACCEPTED connections)

    Posts are sorted by recency (newest first).
    """
    # Find accepted connection partner IDs
    conn_result = await db.execute(
        select(Connection).where(
            or_(
                Connection.sender_id == current_user.id,
                Connection.receiver_id == current_user.id,
            ),
            Connection.status == "ACCEPTED",
        )
    )
    connections = conn_result.scalars().all()
    connected_ids: set[uuid.UUID] = set()
    for conn in connections:
        partner = conn.receiver_id if conn.sender_id == current_user.id else conn.sender_id
        connected_ids.add(partner)

    # Author IDs to include in feed
    feed_author_ids = list(connected_ids | {current_user.id})

    # Total count
    total = (
        await db.scalar(
            select(func.count(Post.id)).where(
                Post.author_id.in_(feed_author_ids),
                Post.visibility.in_(["PUBLIC", "CONNECTIONS"]),
            )
        )
        or 0
    )

    # Paginated posts
    offset = (page - 1) * page_size
    posts_result = await db.execute(
        select(Post)
        .where(
            Post.author_id.in_(feed_author_ids),
            Post.visibility.in_(["PUBLIC", "CONNECTIONS"]),
        )
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    posts = posts_result.scalars().all()

    enriched = await _enrich_posts(list(posts), current_user.id, db)

    return FeedResponse(
        posts=enriched,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(offset + len(posts)) < total,
    )


@router.get("/posts/public", response_model=FeedResponse, summary="Public post feed")
async def get_public_feed(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    """Return public posts from all users, newest first."""
    total = await db.scalar(select(func.count(Post.id)).where(Post.visibility == "PUBLIC")) or 0

    offset = (page - 1) * page_size
    posts_result = await db.execute(
        select(Post)
        .where(Post.visibility == "PUBLIC")
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    posts = posts_result.scalars().all()
    enriched = await _enrich_posts(list(posts), current_user.id, db)

    return FeedResponse(
        posts=enriched,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(offset + len(posts)) < total,
    )


# ── Posts CRUD ─────────────────────────────────────────────────────────────────


@router.post(
    "/posts",
    status_code=status.HTTP_201_CREATED,
    response_model=PostResponse,
    summary="Create a post",
)
async def create_post(
    data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    """Create a new post. The current user becomes the author."""
    post = Post(
        author_id=current_user.id,
        content=data.content,
        image_url=data.image_url,
        link_url=data.link_url,
        link_preview_title=data.link_preview_title,
        visibility=data.visibility,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)

    return PostResponse(
        id=post.id,
        author_id=post.author_id,
        author=_author_summary(current_user),
        content=post.content,
        image_url=post.image_url,
        link_url=post.link_url,
        link_preview_title=post.link_preview_title,
        visibility=post.visibility,
        like_count=0,
        comment_count=0,
        liked_by_me=False,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.get("/posts/{post_id}", response_model=PostResponse, summary="Get single post")
async def get_post(
    post_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    post = await _get_visible_post_or_404(post_id, current_user.id, db)
    enriched = await _enrich_posts([post], current_user.id, db)
    return enriched[0]


@router.patch("/posts/{post_id}", response_model=PostResponse, summary="Update own post")
async def update_post(
    post_id: uuid.UUID,
    data: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostResponse:
    post = await _get_post_or_404(post_id, db)
    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own posts"
        )

    if data.content is not None:
        post.content = data.content
    if data.visibility is not None:
        post.visibility = data.visibility
    await db.flush()
    await db.refresh(post)

    enriched = await _enrich_posts([post], current_user.id, db)
    return enriched[0]


@router.delete(
    "/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete own post"
)
async def delete_post(
    post_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    post = await _get_post_or_404(post_id, db)
    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own posts"
        )
    await db.delete(post)


# ── Likes ──────────────────────────────────────────────────────────────────────


@router.post("/posts/{post_id}/like", summary="Toggle like on a post")
async def toggle_like(
    post_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Toggle like on a post. Returns {liked: true/false, like_count: N}."""
    post = await _get_visible_post_or_404(post_id, current_user.id, db)

    existing = await db.scalar(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
    )

    if existing:
        # Unlike
        await db.delete(existing)
        new_count = max(0, post.like_count - 1)
        post.like_count = new_count
        liked = False
    else:
        # Like
        like = PostLike(post_id=post_id, user_id=current_user.id)
        db.add(like)
        new_count = post.like_count + 1
        post.like_count = new_count
        liked = True

    await db.flush()
    return {"liked": liked, "like_count": new_count}


# ── Comments ───────────────────────────────────────────────────────────────────


@router.get(
    "/posts/{post_id}/comments", response_model=list[CommentResponse], summary="List post comments"
)
async def list_comments(
    post_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentResponse]:
    await _get_visible_post_or_404(post_id, current_user.id, db)
    offset = (page - 1) * page_size
    comments_result = await db.execute(
        select(PostComment)
        .where(PostComment.post_id == post_id)
        .order_by(PostComment.created_at.asc())
        .offset(offset)
        .limit(page_size)
    )
    comments = comments_result.scalars().all()

    # Fetch authors
    author_ids = list({c.author_id for c in comments})
    author_result = await db.execute(select(User).where(User.id.in_(author_ids)))
    authors = {u.id: u for u in author_result.scalars().all()}

    return [
        CommentResponse(
            id=c.id,
            post_id=c.post_id,
            author_id=c.author_id,
            author=_author_summary(authors[c.author_id]) if c.author_id in authors else None,
            content=c.content,
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.post(
    "/posts/{post_id}/comments",
    status_code=status.HTTP_201_CREATED,
    response_model=CommentResponse,
    summary="Add a comment to a post",
)
async def add_comment(
    post_id: uuid.UUID,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    post = await _get_visible_post_or_404(post_id, current_user.id, db)
    comment = PostComment(post_id=post_id, author_id=current_user.id, content=data.content)
    db.add(comment)
    # Increment comment count on the post
    post.comment_count = post.comment_count + 1
    await db.flush()
    await db.refresh(comment)
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author=_author_summary(current_user),
        content=comment.content,
        created_at=comment.created_at,
    )


@router.delete(
    "/posts/{post_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
)
async def delete_comment(
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    comment = await db.get(PostComment, comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own comments"
        )
    post = await _get_post_or_404(post_id, db)
    post.comment_count = max(0, post.comment_count - 1)
    await db.delete(comment)
