"""FastAPI application factory."""

import hashlib
import hmac
import logging
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import inspect, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import models
from .auth import (
    AuthError,
    TelegramUser,
    issue_session_token,
    read_session_token,
    verify_init_data,
)
from .categories import CATEGORIES, guess_category
from .config import Settings
from .db import Base, make_engine, make_session_factory
from .i18n import FIRST_LIST_NAME, SYSTEM_CATEGORIES, effective_language
from .normalize import normalize
from .parsing import parse_input
from .suggest import MAX_SUGGESTIONS, rank

MAX_ITEMS_PER_ADD = 100

logger = logging.getLogger(__name__)


class UserOut(BaseModel):
    id: int
    telegram_id: int
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None
    language_code: str | None
    # Effective interface language, "ru" or "es": the user's choice, else from language_code.
    language: str
    # True when the user overrode Telegram's language in Settings.
    language_overridden: bool


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


class EntryOut(BaseModel):
    id: int
    product_id: int
    name: str
    note: str | None
    category: str
    added_by: int | None
    created_at: datetime


class CategoryGroupOut(BaseModel):
    key: str
    emoji: str
    # Name in the user's interface language.
    name: str
    count: int
    entries: list[EntryOut]


class ListContentsOut(BaseModel):
    list: ListOut
    # Only non-empty groups, in the fixed system order ("Без категории" last).
    categories: list[CategoryGroupOut]


class AddEntriesIn(BaseModel):
    # Raw input line(s): `;` and line breaks separate Entries, the first comma starts the Note.
    text: str = Field(max_length=20000)
    # Client-generated idempotency id; replaying the same id returns the same Entries.
    client_id: str | None = Field(default=None, min_length=1, max_length=64)


class AddEntriesOut(BaseModel):
    version: int
    entries: list[EntryOut]


class SuggestionOut(BaseModel):
    product_id: int
    name: str
    category: str
    # True when the Product already has an Entry on the List (a duplicate is still allowed).
    on_list: bool


class ProductHiddenOut(BaseModel):
    version: int


class MeUpdate(BaseModel):
    # "ru" or "es" sets the language; null goes back to following Telegram.
    language: Literal["ru", "es"] | None


class CategoryOut(BaseModel):
    key: str
    name: str


class JoinIn(BaseModel):
    code: str = Field(max_length=64)


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
        language=effective_language(user.language, user.language_code),
        language_overridden=user.language is not None,
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


def list_out(lst: models.List, lang: str, bot_username: str = "") -> ListOut:
    members = sorted(lst.members, key=lambda m: m.id)
    return ListOut(
        id=lst.id,
        # An auto-created name is rendered in the viewer's language until a Member renames it.
        name=FIRST_LIST_NAME[lang] if lst.name_is_default else lst.name,
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


def _add_missing_columns(engine) -> None:
    """create_all does not alter existing tables; add columns introduced later.

    Ad-hoc stopgap: replace with a migration tool (e.g. Alembic) once one is introduced.
    """
    inspector = inspect(engine)
    additions = [
        ("user", "language", "VARCHAR(8)"),
        ("list", "name_is_default", "BOOLEAN NOT NULL DEFAULT 0"),
        ("product", "purchase_count", "INTEGER NOT NULL DEFAULT 0"),
        ("product", "hidden", "BOOLEAN NOT NULL DEFAULT 0"),
    ]
    for table, column, ddl in additions:
        if column not in {c["name"] for c in inspector.get_columns(table)}:
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl}'))


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
        if not settings.bot_username.lstrip("@"):
            logger.warning("SL_BOT_USERNAME is not set: Share links cannot be built")
        Base.metadata.create_all(engine)
        _add_missing_columns(engine)
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
                name=FIRST_LIST_NAME[effective_language(user.language, user.language_code)],
                name_is_default=True,
                created_by=user.id,
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

    @api.patch("/me", response_model=UserOut)
    def update_me(body: MeUpdate, user: UserDep, session: SessionDep) -> UserOut:
        user.language = body.language
        session.commit()
        return user_out(user)

    @api.get("/categories", response_model=list[CategoryOut])
    def categories(user: UserDep) -> list[CategoryOut]:
        """System Categories named in the user's effective language."""
        lang = effective_language(user.language, user.language_code)
        return [CategoryOut(key=key, name=names[lang]) for key, names in SYSTEM_CATEGORIES]

    def _member_lists(user: models.User):
        return (
            select(models.List)
            .join(models.ListMember)
            .where(models.ListMember.user_id == user.id)
            .options(selectinload(models.List.members).selectinload(models.ListMember.user))
        )

    @api.get("/lists", response_model=list[ListOut])
    def my_lists(user: UserDep, session: SessionDep) -> list[ListOut]:
        stmt = _member_lists(user).order_by(models.List.updated_at.desc(), models.List.id.desc())
        lang = effective_language(user.language, user.language_code)
        return [list_out(lst, lang, settings.bot_username) for lst in session.scalars(stmt)]

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
        return list_out(
            lst, effective_language(user.language, user.language_code), settings.bot_username
        )

    @api.get("/lists/{list_id}", response_model=ListOut)
    def get_list(list_id: int, user: UserDep, session: SessionDep) -> ListOut:
        lst = session.scalar(_member_lists(user).where(models.List.id == list_id))
        if lst is None:  # also hides the existence of Lists the user is not a Member of
            raise HTTPException(404, "list not found")
        return list_out(
            lst, effective_language(user.language, user.language_code), settings.bot_username
        )

    def _entry_out(entry: models.Entry) -> EntryOut:
        return EntryOut(
            id=entry.id,
            product_id=entry.product_id,
            name=entry.name,
            note=entry.note,
            category=entry.product.category_key,
            added_by=entry.added_by,
            created_at=entry.created_at,
        )

    def _member_list_or_404(session: Session, user: models.User, list_id: int) -> models.List:
        lst = session.scalar(_member_lists(user).where(models.List.id == list_id))
        if lst is None:
            raise HTTPException(404, "list not found")
        return lst

    @api.get("/lists/{list_id}/entries", response_model=ListContentsOut)
    def list_entries(list_id: int, user: UserDep, session: SessionDep) -> ListContentsOut:
        lst = _member_list_or_404(session, user, list_id)
        entries = session.scalars(
            select(models.Entry)
            .where(models.Entry.list_id == lst.id)
            .options(selectinload(models.Entry.product))
            .order_by(models.Entry.created_at, models.Entry.id)
        ).all()
        language = effective_language(user.language, user.language_code)
        groups = []
        for category in CATEGORIES:
            members = [_entry_out(e) for e in entries if e.product.category_key == category.key]
            if members:
                groups.append(
                    CategoryGroupOut(
                        key=category.key,
                        emoji=category.emoji,
                        name=category.name(language),
                        count=len(members),
                        entries=members,
                    )
                )
        return ListContentsOut(
            list=list_out(lst, language, settings.bot_username), categories=groups
        )

    @api.post("/lists/{list_id}/entries", response_model=AddEntriesOut, status_code=201)
    def add_entries(
        list_id: int,
        body: AddEntriesIn,
        response: Response,
        user: UserDep,
        session: SessionDep,
    ) -> AddEntriesOut:
        lst = _member_list_or_404(session, user, list_id)
        items = parse_input(body.text)
        if not items:
            raise HTTPException(422, "no items in the input")
        if len(items) > MAX_ITEMS_PER_ADD:
            raise HTTPException(422, f"at most {MAX_ITEMS_PER_ADD} items per request")

        def keys() -> list[str | None]:
            if body.client_id is None:
                return [None] * len(items)
            return [f"{body.client_id}:{i}" for i in range(len(items))]

        def replay() -> AddEntriesOut | None:
            if body.client_id is None:
                return None
            found = session.scalars(
                select(models.Entry)
                .where(models.Entry.list_id == lst.id, models.Entry.client_id.in_(keys()))
                .order_by(models.Entry.id)
            ).all()
            if not found:
                return None
            response.status_code = 200
            # Known limitation for the sync ticket: a replay reports the List's *current*
            # version, not the version the original add produced.
            return AddEntriesOut(version=lst.version, entries=[_entry_out(e) for e in found])

        if (replayed := replay()) is not None:
            return replayed

        created: list[models.Entry] = []
        for attempt in range(2):
            products = {
                p.name_norm: p
                for p in session.scalars(
                    select(models.Product).where(models.Product.list_id == lst.id)
                )
            }
            created = []
            try:
                for item, client_key in zip(items, keys(), strict=True):
                    norm = normalize(item.name)
                    product = products.get(norm)
                    if product is not None:
                        product.hidden = False  # entering the name again restores the memory
                    if product is None:
                        product = models.Product(
                            list_id=lst.id,
                            name=item.name,
                            name_norm=norm,
                            category_key=guess_category(item.name),
                        )
                        session.add(product)
                        products[norm] = product
                    entry = models.Entry(
                        list_id=lst.id,
                        product=product,
                        name=item.name,
                        note=item.note,
                        added_by=user.id,
                        client_id=client_key,
                    )
                    session.add(entry)
                    created.append(entry)
                session.execute(
                    update(models.List)
                    .where(models.List.id == lst.id)
                    .values(version=models.List.version + 1, updated_at=models.utcnow())
                )
                session.commit()
                break
            except IntegrityError:
                # A concurrent request won a race: the same client_id (a replay) or the same
                # new Product name. Replays return the winner's Entries; otherwise retry once.
                session.rollback()
                lst = _member_list_or_404(session, user, list_id)
                if (replayed := replay()) is not None:
                    return replayed
                if attempt == 1:
                    raise
        session.refresh(lst)
        return AddEntriesOut(version=lst.version, entries=[_entry_out(e) for e in created])

    @api.get("/lists/{list_id}/suggestions", response_model=list[SuggestionOut])
    def suggestions(
        list_id: int,
        user: UserDep,
        session: SessionDep,
        q: Annotated[str, Query(max_length=200)] = "",
    ) -> list[SuggestionOut]:
        """Products of this List matching the typed text (never other Lists' Products)."""
        lst = _member_list_or_404(session, user, list_id)
        query = normalize(q)
        if not query:
            return []
        products = session.scalars(
            select(models.Product).where(
                models.Product.list_id == lst.id, models.Product.hidden.is_(False)
            )
        ).all()
        top = rank(query, products)[:MAX_SUGGESTIONS]
        on_list = set(
            session.scalars(
                select(models.Entry.product_id)
                .where(models.Entry.list_id == lst.id)
                .where(models.Entry.product_id.in_([p.id for p in top]))
            )
        )
        return [
            SuggestionOut(
                product_id=p.id, name=p.name, category=p.category_key, on_list=p.id in on_list
            )
            for p in top
        ]

    @api.delete("/lists/{list_id}/products/{product_id}", response_model=ProductHiddenOut)
    def hide_product(
        list_id: int, product_id: int, user: UserDep, session: SessionDep
    ) -> ProductHiddenOut:
        """Remove a Product from the List's memory. It is only hidden from suggestions."""
        lst = _member_list_or_404(session, user, list_id)
        product = session.scalar(
            select(models.Product).where(
                models.Product.id == product_id, models.Product.list_id == lst.id
            )
        )
        if product is None:
            raise HTTPException(404, "product not found")
        if not product.hidden:
            product.hidden = True
            session.execute(
                update(models.List)
                .where(models.List.id == lst.id)
                .values(version=models.List.version + 1, updated_at=models.utcnow())
            )
            session.commit()
            session.refresh(lst)
        return ProductHiddenOut(version=lst.version)

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
