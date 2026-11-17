# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

The walking skeleton exists: Telegram sign-in, the first List, and an empty List screen, plus Invites and Share links (`GET /api/lists/{id}/invite`, `POST …/invite/reset`, `POST /api/lists/join`, see `docs/adr/0005-invites-are-their-own-entity.md`) and the Members screen (each Member shows `invited_by`). Suggestions from the List's memory: `GET /api/lists/{id}/suggestions?q=` (ranking in `suggest.py`) and `DELETE /api/lists/{id}/products/{product_id}` (hides a Product from memory). Purchase History: `GET /api/lists/{id}/purchases?cursor=&limit=` (newest first, keyset cursor) and `POST /api/lists/{id}/purchases/{purchase_id}/entries/{item_id}/readd` (puts a past item back on the List); the History screen opens from the List menu. Backend is in `src/shopping_list_bot/` (FastAPI + sync SQLAlchemy on Postgres 18 through psycopg 3, schema by Alembic, see `docs/adr/0004-postgres-database.md`; migration `0002` hardens it: BIGINT identity keys, `notification.items` as JSONB, CHECKs on kinds, categories and language, indexes on hot foreign keys, so a new `list_change` kind, Category or language needs a migration that widens its CHECK), the Mini App in `frontend/` (React + Vite + TypeScript; `@telegram-apps/telegram-ui` is being adopted screen by screen, the List screen is built on it, wrapped in `AppRoot` by `components/TelegramRoot.tsx`; its React 18 peer range is overridden in `package.json`), and the bot in `src/shopping_list_bot/bot.py` (aiogram). On startup the bot sets its description, short description and commands (`/start`, `/help`) for ru, es, en and a default; `/start` and `/help` send the same step-by-step text in the user's language with the «Открыть список» button. The `user` row keeps everything `initData` gives (profile fields plus `is_premium`, `allows_write_to_pm`, `added_to_attachment_menu`, added by migration `0003`) and is refreshed on every sign-in; nothing is fetched from the Bot API. Realtime sync: every List mutation takes the List row lock first (`_member_list(..., lock=True)`, `SELECT … FOR UPDATE`) and goes through `_touch` in `app.py` (bumps the version under that lock, writes the `list_change` log, queues an event published after commit). `GET /api/events` is the per-user SSE stream, `GET /api/lists/{id}/changes?since=<version>` the catch-up (a snapshot when the gap exceeds `SL_CHANGES_MAX_GAP` or the log was pruned), and the `Idempotency-Key` header makes any command replay-safe (middleware in `app.py`, answers stored in `idempotency_record`). The client side is `frontend/src/sync.ts` (stream with reconnect) plus the handlers in `App.tsx` and `ListScreen.tsx`. Everything else is built ticket by ticket from GitHub issue #1.

**Product spec:** [docs/ui-spec.md](docs/ui-spec.md) (Russian). It covers scope, screens, input parsing, sync, Telegram Mini App rules, the data model, MVP staging, and acceptance criteria. Read the relevant section before building a feature.

## Commands

Tooling is `uv` with the `uv_build` backend. Python is **3.14**, pinned in `.python-version` and `requires-python`. The frontend needs Node 20+ and npm.

```bash
uv sync                                  # create .venv and install
uv add <pkg>                             # add a runtime dependency
uv add --dev <pkg>                       # add a dev dependency

uv run shopping-list-bot migrate         # apply Alembic migrations to SL_DATABASE_URL (the app refuses to start unmigrated)
uv run pytest                            # run the whole backend suite (needs Docker for the Postgres testcontainer)
uv run pytest tests/test_auth_and_first_list.py::TestFirstList::test_first_time_russian_user_gets_pokupki  # one test
uv run pytest -k pokupki                 # tests by keyword
uv run ruff check . && uv run ruff format --check .   # lint and format check

uv run shopping-list-bot serve           # backend on :8000 (serves frontend/dist if built)
uv run shopping-list-bot bot             # the Telegram bot (long polling); needs SL_BOT_TOKEN

cd frontend && npm install               # once
cd frontend && npm run dev               # Vite dev server on :5173, proxies /api to :8000
cd frontend && npm run build             # typecheck (tsc) + production build into frontend/dist
cd frontend && npm run typecheck         # typecheck only
```

**Docker and CI.** One image serves every process. The default is `serve` (API plus the built Mini App on :8000, Postgres at `SL_DATABASE_URL`); the bot runs from the same image with the `bot` command, and `migrate` is the one-shot that applies the schema migrations before `serve` starts.

```bash
docker build -t shared-lists .
docker run --env-file .env shared-lists shopping-list-bot migrate      # schema, run first and after every upgrade
docker run -p 8000:8000 --env-file .env shared-lists                   # API + Mini App
docker run --env-file .env shared-lists shopping-list-bot bot          # bot
```

**Local dev stack with Telegram.** `docker-compose.dev.yml` runs `db` (postgres:18, volume `pgdata`), a one-shot `migrate`, `app`, the bot, and an ngrok tunnel; `app` and the bot use `SL_DATABASE_URL=postgresql+psycopg://shopping_list:shopping_list@db:5432/shopping_list`. The tunnel gives the Mini App the public https URL that Telegram requires. `.env` needs `SL_BOT_TOKEN`, `SL_BOT_USERNAME` and `NGROK_AUTHTOKEN`. `NGROK_URL` is optional; without it, the bot reads the tunnel URL from the ngrok inspector API through `docker/dev-bot-entrypoint.py`. The ngrok inspector is at http://localhost:4040.

```bash
docker compose -f docker-compose.dev.yml up -d --build   # start / rebuild after code changes
docker compose -f docker-compose.dev.yml logs -f bot app # follow logs
docker compose -f docker-compose.dev.yml down            # stop (the Postgres volume `pgdata` is kept)
```

GitHub Actions has two workflows:
- `.github/workflows/ci.yml` runs on every pull request: ruff lint and format check, pytest, the frontend typecheck and build, and a Docker build with a smoke test (`/healthz`, the frontend served, the bot module importable).
- `.github/workflows/release.yml` runs on a `v*` tag push. It builds an amd64 and arm64 image and pushes it to Docker Hub as `<DOCKERHUB_IMAGE>` (default `<username>/shared-lists`). Tags are `1.2.3`, `1.2`, `latest` (not for pre-release tags like `v1.3.0-rc1`) and `sha-<short>`. It needs the repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Read & Write access token); the optional variable `DOCKERHUB_IMAGE` overrides the image name. Release with:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

**Importing the live SQLite data** (`importer.py`, one-shot): `shopping-list-bot import-sqlite <path>` copies every table of the MVP's SQLite file into the Postgres at `SL_DATABASE_URL`, which must be migrated (`shopping-list-bot migrate`) and empty. Stop the old app first so the file is no longer written, and keep the SQLite file as the backup. Rows keep their ids and identity sequences are moved past the largest id; naive SQLite datetimes become UTC; `notification.items` (TEXT) becomes JSONB. It runs in one transaction, refuses a target that has any row, prints `<table>: source N, target N` per table, and rolls everything back when a count differs. Run it once from the app image: `docker run --rm -v <dir with the file>:/import --env-file .env shared-lists shopping-list-bot import-sqlite /import/shared_lists.db`. Then start `serve` and `bot`.

**Bot notifications** (`notifications.py`): adding Entries and «Куплено» queue a row in `notification` inside the same transaction. The backend's lifespan runs a loop every `NOTIFY_POLL_SECONDS` (5) that sends what is due through the Bot API to every other Member (in their language, with a button that opens the Mini App at `?list=<id>`). A burst of adds by one Member is one message: due `NOTIFY_ADDED_QUIET_SECONDS` (180) after their last add, capped at `NOTIFY_ADDED_MAX_SECONDS` (900) from the first. A Purchase is announced `NOTIFY_BOUGHT_DELAY_SECONDS` (30) after it; Undo deletes the Purchase and the queued row with it (FK cascade). Only the backend sends; the bot process never does. Tests build the app with `create_app(settings, notify_send=fake)` and call `app.state.notifier.deliver_due(now)`; `tests/conftest.py` sets `SL_NOTIFY_POLL_SECONDS=0` so no test ever reaches Telegram.

**Sync tuning** (all optional, `SL_` prefix): `CHECK_WINS_WINDOW_SECONDS` (2.0; another Member's uncheck within this long after a check is dropped), `CHANGES_MAX_GAP` (100), `CHANGES_RETENTION` (500 versions of log per List), `SSE_HEARTBEAT_SECONDS` (15), `IDEMPOTENCY_TTL_SECONDS` (24 h).

**Configuration** is read from `SL_*` environment variables or a `.env` file: `SL_BOT_TOKEN`, `SL_BOT_USERNAME` (the bot's @username without `@`; builds Share links `https://t.me/<bot>?startapp=join_<code>`; the invite `url` is null without it), `SL_WEBAPP_URL` (public https URL of the Mini App), `SL_DATABASE_URL` (default `postgresql+psycopg://shopping_list:shopping_list@localhost:5432/shopping_list`; the schema is owned by Alembic migrations in `src/shopping_list_bot/migrations/`, applied by `shopping-list-bot migrate`, and the app refuses to start when the database is not at the newest one), `SL_SESSION_SECRET` (optional; derived from the bot token if empty; with neither set, no session is issued or accepted). The bot also reads `SL_DATABASE_URL` (to look up a user's chosen language for `/start`), so it must point at the same database as the backend; the backend owns the schema, and if the database is unreachable or not yet migrated the bot falls back to Telegram's language. No real bot token is needed to run tests or build.

**Tests:** the only automated seam is the backend HTTP API. `tests/test_event_stream.py` is the exception in transport only: Starlette's `TestClient` buffers a response until it ends, so the never-ending SSE stream is tested against a real uvicorn server on a local port (the `server` fixture), still through HTTP only. Run it alone with `uv run pytest tests/test_event_stream.py`. `tests/conftest.py` runs the suite on Postgres only: a session-wide testcontainers `postgres:18` (or the server in `SL_TEST_POSTGRES_URL`, which CI points at its service container) holds a migrated template database, and each test gets a fresh copy of it (`database_url` fixture; `blank_database_url` for the migration tests). It also gives a `sign_in` fixture that authenticates with `initData` signed by a test bot token. Test external behaviour (request in, response out), never internals. The frontend has no automated tests; it must typecheck and build.

**Telegram setup (manual, once):** in @BotFather set the bot's menu button and Main Mini App to `SL_WEBAPP_URL` so `t.me/<bot>?startapp=join_<code>` links work. The bot also sets the menu button itself on startup.

## What is being built

**Shared Lists** is an app for shared shopping lists, delivered as a **Telegram Mini App**. It opens from a Telegram bot through the menu button and inline buttons. The backend is **FastAPI**. There are no recipes, meal plans, pantry or expenses; keep the scope to the list. The UI is in RU, ES and EN. The language defaults to the Telegram user's `language_code`; a language we do not speak falls back to English.

Planned pieces that interact:
- **Bot**: a share link (a bot deep link whose start parameter identifies a list; opening it joins the user to that list), notifications sent as bot messages (a Mini App has no push or background sync), and later voice and text input in chat.
- **FastAPI backend**: auth, a list-scoped REST API, a realtime channel (SSE or WebSocket), and a `changes?since=<version>` catch-up endpoint.
- **Mini App frontend**: reads `themeParams` CSS variables, keeps an offline cache and an operation queue, and uses native Telegram controls.

## Architectural invariants (from the spec — easy to get wrong)

- **Auth:** the frontend sends raw `initData`. The backend verifies the HMAC signature with the bot token and checks `auth_date` freshness, then issues a session. Never trust `initDataUnsafe`.
- **The list is the sharing unit:** there is no group or family above it (see `docs/adr/0001-list-is-the-sharing-unit.md`). A user creates lists and shares each one by link. Everyone who joins has equal rights, deleting the list included. Deleting a list always goes through a confirmation screen.
- **Versioning:** each list has a monotonic `version` counter that every mutation bumps. Realtime events and `changes?since` both depend on it. The client calls catch-up on Mini App activation and on reconnect.
- **Offline ops:** client mutations carry idempotent client-generated ids, so the backend must accept replays safely.
- **Conflict rules are per operation type, not last-write-wins:** a check beats an uncheck that happens at nearly the same time; delete beats edit; concurrent adds of the same item both stay, as two rows.
- **Catalog vs list:** `item` is the list's memory of entered products (normalized name, category, purchase stats). It is scoped to one list, and suggestions never draw on other lists. `list_entry` is an item placed on a list, with a free-text note. Adding an item that is already on the list creates another row: duplicates are allowed on purpose and never merged (see `docs/adr/0002-duplicate-entries-allowed.md`). Removing an item from memory only hides it from suggestions.
- **Checking is a toggle; «Куплено» removes:** a tap crosses an entry out in place, and a second tap restores it. Checked entries stay on the list until «Куплено» (the Telegram `MainButton`, shown only while something is checked). It removes all of them at once and records them as one purchase in the list's history. It has a 5 s Undo, and the item purchase stats update on «Куплено», not on check. History is loaded in pages with a cursor, never all at once.
- **Never block adding:** category, unit and store are never required. Unknown items go to "Без категории". Category is guessed from an RU/ES/EN dictionary (`categories.py`; English words live in `EN_WORDS`), with an LLM considered later.
- **Input parsing:** one line can hold several items, split by `;` or a newline. A comma splits name from note (`молоко, 2 л`). Pasting multiline text adds every line. Search ignores case and diacritics (`platano` = `plátano`) and tolerates one typo.
- **Store ordering:** `store_category_order.is_manual = true` freezes the order, and the learned order from `checkout_log` must not override it.
- **Telegram client:** call `ready()`, `expand()` and `disableVerticalSwipes()` at startup, because swipes on list rows must not close the app. Use only `--tg-theme-*` colors; a custom palette is allowed only for category icons. Turn on `enableClosingConfirmation()` only while offline ops are pending. Every destructive action needs Undo (at least 5 s) or a `showConfirm`.

## Staging

The MVP covers Telegram login, multiple lists shared by link, delete with confirmation, input with suggestions, dictionary categories, check/uncheck, the «Куплено» button that moves checked entries into the list's purchase history, member avatars in the header, realtime, Telegram themes, and RU/ES/EN. Bot notifications for adds and «Куплено» and renaming a Product (`PATCH /api/lists/{id}/products/{product_id}`, merging into an existing Product with that name) are built too. Product aliases (backend): `POST /api/lists/{id}/products/{product_id}/aliases` and `DELETE …/aliases/{alias_id}`; an alias is another name that suggestions match (`matched_alias` in the hit) and that adds the Product under its canonical name, it is unique among the List's Product names and aliases (409), moves to the target when a rename merges Products, and `aliases` is in the Entry and Product payloads. Stores and their ordering, in-store mode and the offline queue come next (see spec §9). Don't build later-stage features unless asked.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `semaputnik/shopping-list-bot`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels are used under their default names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
