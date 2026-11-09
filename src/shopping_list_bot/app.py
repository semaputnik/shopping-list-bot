"""FastAPI application factory."""

import hashlib
import hmac
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .auth import (
    AuthError,
    TelegramUser,
    issue_session_token,
    read_session_token,
    verify_init_data,
)
from .config import Settings
from .db import Base, make_engine, make_session_factory
from .i18n import FIRST_LIST_NAME, pick_language


class UserOut(BaseModel):
    id: int
    telegram_id: int
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None
    language_code: str | None
    # Interface language picked from language_code: "ru" or "es".
    language: str


class MemberOut(BaseModel):
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None


class ListOut(BaseModel):
    id: int
    name: str
    share_code: str
    # The Share link, `https://t.me/<bot>?startapp=<code>`; null while SL_BOT_USERNAME is unset.
    share_url: str | None
    # Members in the order they joined (the creator first).
    members: list[MemberOut]
    version: int
    updated_at: datetime


class JoinIn(BaseModel):
    code: str


class AuthIn(BaseModel):
    init_data: str


class AuthOut(BaseModel):
    token: str
    expires_at: int
    user: UserOut
    # The raw `startapp` value of the launch link, if any (a Share link's code).
    start_param: str | None


def user_out(user: models.User) -> UserOut:
    return UserOut(
        id=user.id,
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        photo_url=user.photo_url,
        language_code=user.language_code,
        language=pick_language(user.language_code),
    )


def member_out(user: models.User) -> MemberOut:
    return MemberOut(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        photo_url=user.photo_url,
    )


def share_url(bot_username: str, share_code: str) -> str | None:
    username = bot_username.lstrip("@")
    return f"https://t.me/{username}?startapp={share_code}" if username else None


def list_out(lst: models.List, bot_username: str = "") -> ListOut:
    members = sorted(lst.members, key=lambda m: m.id)
    return ListOut(
        id=lst.id,
        name=lst.name,
        share_code=lst.share_code,
        share_url=share_url(bot_username, lst.share_code),
        members=[member_out(m.user) for m in members],
        version=lst.version,
        updated_at=lst.updated_at,
    )


def _upsert_user(session: Session, tg: TelegramUser) -> tuple[models.User, bool]:
    """Create or refresh the user from verified Telegram data. Returns (user, created)."""
    user = session.scalar(select(models.User).where(models.User.telegram_id == tg.id))
    created = user is None
    if user is None:
        user = models.User(telegram_id=tg.id, first_name=tg.first_name)
        session.add(user)
    user.first_name = tg.first_name
    user.last_name = tg.last_name
    user.username = tg.username
    user.photo_url = tg.photo_url
    user.language_code = tg.language_code
    return user, created


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    # Fail closed: with neither SL_SESSION_SECRET nor a bot token there is no secret, and
    # no session is issued (sign-in needs the bot token anyway) or accepted.
    secret = settings.session_secret or (
        hmac.new(b"shared-lists-session", settings.bot_token.encode(), hashlib.sha256).hexdigest()
        if settings.bot_token
        else ""
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="Shared Lists", lifespan=lifespan)

    def get_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    SessionDep = Annotated[Session, Depends(get_session)]

    def current_user(
        session: SessionDep, authorization: Annotated[str | None, Header()] = None
    ) -> models.User:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(401, "not authenticated")
        if not secret:
            raise HTTPException(401, "invalid session")
        try:
            user_id = read_session_token(token, secret)
        except AuthError:
            raise HTTPException(401, "invalid session") from None
        user = session.get(models.User, user_id)
        if user is None:
            raise HTTPException(401, "invalid session")
        return user

    UserDep = Annotated[models.User, Depends(current_user)]

    api = APIRouter(prefix="/api")

    @api.post("/auth", response_model=AuthOut)
    def auth(body: AuthIn, session: SessionDep) -> AuthOut:
        try:
            data = verify_init_data(
                body.init_data,
                settings.bot_token,
                max_age_seconds=settings.init_data_max_age_seconds,
            )
        except AuthError as exc:
            raise HTTPException(401, f"invalid initData: {exc}") from None

        try:
            user, created = _upsert_user(session, data.user)
            session.flush()
        except IntegrityError:  # concurrent first sign-in of the same user
            session.rollback()
            user, created = _upsert_user(session, data.user)
            created = False
        # A first-time user gets their own first List, unless they arrived through a Share
        # link of an existing List (the client then joins that one through POST /api/lists/join). An unknown
        # or stale code does not count: they would be left with no List at all.
        arrived_by_share_link = bool(data.start_param) and (
            session.scalar(select(models.List.id).where(models.List.share_code == data.start_param))
            is not None
        )
        if created and not arrived_by_share_link:
            lst = models.List(
                name=FIRST_LIST_NAME[pick_language(user.language_code)], created_by=user.id
            )
            lst.members.append(models.ListMember(user_id=user.id))
            session.add(lst)
        session.commit()

        token, expires_at = issue_session_token(user.id, secret, settings.session_ttl_seconds)
        return AuthOut(
            token=token,
            expires_at=expires_at,
            user=user_out(user),
            start_param=data.start_param,
        )

    @api.get("/me", response_model=UserOut)
    def me(user: UserDep) -> UserOut:
        return user_out(user)

    def _member_lists(user: models.User):
        return (
            select(models.List).join(models.ListMember).where(models.ListMember.user_id == user.id)
        )

    @api.get("/lists", response_model=list[ListOut])
    def my_lists(user: UserDep, session: SessionDep) -> list[ListOut]:
        stmt = _member_lists(user).order_by(models.List.updated_at.desc(), models.List.id.desc())
        return [list_out(lst, settings.bot_username) for lst in session.scalars(stmt)]

    @api.post("/lists/join", response_model=ListOut)
    def join_list(body: JoinIn, user: UserDep, session: SessionDep) -> ListOut:
        """Open a Share link: make the user a Member of the List (idempotent for Members)."""
        lst = session.scalar(select(models.List).where(models.List.share_code == body.code))
        if lst is None:
            raise HTTPException(404, "share link is not valid")
        if all(m.user_id != user.id for m in lst.members):
            lst.members.append(models.ListMember(user_id=user.id))
            lst.version += 1
            lst.updated_at = models.utcnow()
            try:
                session.commit()
            except IntegrityError:  # concurrent join by the same user: already a Member
                session.rollback()
                lst = session.scalar(select(models.List).where(models.List.share_code == body.code))
                assert lst is not None
        return list_out(lst, settings.bot_username)

    @api.get("/lists/{list_id}", response_model=ListOut)
    def get_list(list_id: int, user: UserDep, session: SessionDep) -> ListOut:
        lst = session.scalar(_member_lists(user).where(models.List.id == list_id))
        if lst is None:  # also hides the existence of Lists the user is not a Member of
            raise HTTPException(404, "list not found")
        return list_out(lst, settings.bot_username)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api)

    dist = settings.frontend_dist
    if dist.is_dir():
        if (dist / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str, request: Request) -> FileResponse:
            if path.startswith("api/"):
                raise HTTPException(404, "not found")
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app
