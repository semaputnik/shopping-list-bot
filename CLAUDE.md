# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

The walking skeleton exists: Telegram sign-in, the first List, and an empty List screen. Backend is in `src/shopping_list_bot/` (FastAPI + SQLAlchemy + SQLite, see `docs/adr/0003-sqlite-database.md`), the Mini App in `frontend/` (React + Vite + TypeScript), and the bot in `src/shopping_list_bot/bot.py` (aiogram). Everything else is built ticket by ticket from GitHub issue #1.

**Product spec:** [docs/ui-spec.md](docs/ui-spec.md) (Russian). It covers scope, screens, input parsing, sync, Telegram Mini App rules, the data model, MVP staging, and acceptance criteria. Read the relevant section before building a feature.

## Commands

Tooling is `uv` with the `uv_build` backend. Python is **3.14**, pinned in `.python-version` and `requires-python`. The frontend needs Node 20+ and npm.

```bash
uv sync                                  # create .venv and install
uv add <pkg>                             # add a runtime dependency
uv add --dev <pkg>                       # add a dev dependency

uv run pytest                            # run the whole backend suite
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

**Configuration** is read from `SL_*` environment variables or a `.env` file: `SL_BOT_TOKEN`, `SL_WEBAPP_URL` (public https URL of the Mini App), `SL_DATABASE_URL` (default `sqlite:///./shared_lists.db`), `SL_SESSION_SECRET` (optional; derived from the bot token if empty; with neither set, no session is issued or accepted). No real bot token is needed to run tests or build.

**Tests:** the only automated seam is the backend HTTP API. `tests/conftest.py` gives each test a fresh SQLite file and a `sign_in` fixture that authenticates with `initData` signed by a test bot token. Test external behaviour (request in, response out), never internals. The frontend has no automated tests; it must typecheck and build.

**Telegram setup (manual, once):** in @BotFather set the bot's menu button and Main Mini App to `SL_WEBAPP_URL` so `t.me/<bot>?startapp=<code>` links work. The bot also sets the menu button itself on startup.

## What is being built

**Shared Lists** is an app for shared shopping lists, delivered as a **Telegram Mini App**. It opens from a Telegram bot through the menu button and inline buttons. The backend is **FastAPI**. There are no recipes, meal plans, pantry or expenses; keep the scope to the list. The UI is in RU and ES, with EN optional. The language defaults to the Telegram user's `language_code`.

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
- **Never block adding:** category, unit and store are never required. Unknown items go to "Без категории". Category is guessed from an RU/ES dictionary, with an LLM considered later.
- **Input parsing:** one line can hold several items, split by `;` or a newline. A comma splits name from note (`молоко, 2 л`). Pasting multiline text adds every line. Search ignores case and diacritics (`platano` = `plátano`) and tolerates one typo.
- **Store ordering:** `store_category_order.is_manual = true` freezes the order, and the learned order from `checkout_log` must not override it.
- **Telegram client:** call `ready()`, `expand()` and `disableVerticalSwipes()` at startup, because swipes on list rows must not close the app. Use only `--tg-theme-*` colors; a custom palette is allowed only for category icons. Turn on `enableClosingConfirmation()` only while offline ops are pending. Every destructive action needs Undo (at least 5 s) or a `showConfirm`.

## Staging

The MVP covers Telegram login, multiple lists shared by link, delete with confirmation, input with suggestions, dictionary categories, check/uncheck, the «Куплено» button that moves checked entries into the list's purchase history, member avatars in the header, realtime, Telegram themes, and RU/ES. Stores and their ordering, in-store mode, the offline queue and bot notifications come next (see spec §9). Don't build later-stage features unless asked.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `semaputnik/shopping-list-bot`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels are used under their default names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
