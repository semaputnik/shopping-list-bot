# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Greenfield. The repo is a bare `uv init --package` scaffold: `src/shopping_list_bot/__init__.py` holds only a hello-world `main()`. There are no dependencies, tests, linter, or frontend yet. Treat the product spec as the source of truth until real code exists.

**Product spec:** [docs/ui-spec.md](docs/ui-spec.md) (Russian). It covers scope, screens, input parsing, sync, Telegram Mini App rules, the data model, MVP staging, and acceptance criteria. Read the relevant section before building a feature.

## Commands

Tooling is `uv` with the `uv_build` backend. Python is **3.14**, pinned in `.python-version` and `requires-python`.

```bash
uv sync                      # create .venv and install
uv run shopping-list-bot     # run the console entry point (shopping_list_bot:main)
uv add <pkg>                 # add a runtime dependency
uv add --dev <pkg>           # add a dev dependency (e.g. pytest, ruff)
```

There is no test runner or linter configured yet. When one is added, document how to run the full suite and a single test here.

## What is being built

This is a shared shopping list for one family, delivered as a **Telegram Mini App**. It opens from a Telegram bot through the menu button and inline buttons. The backend is **FastAPI**. There are no recipes, meal plans, pantry or expenses; keep the scope to the list. The UI is in RU and ES, with EN optional. The language defaults to the Telegram user's `language_code`.

Planned pieces that interact:
- **Bot**: deep links (`t.me/<bot>?startapp=invite_<token>` for invites, plus opening a specific list), notifications sent as bot messages (a Mini App has no push or background sync), and later voice and text input in chat.
- **FastAPI backend**: auth, the household-scoped REST API, a realtime channel (SSE or WebSocket), and a `changes?since=<version>` catch-up endpoint.
- **Mini App frontend**: reads `themeParams` CSS variables, keeps an offline cache and an operation queue, and uses native Telegram controls.

## Architectural invariants (from the spec — easy to get wrong)

- **Auth:** the frontend sends raw `initData`. The backend verifies the HMAC signature with the bot token and checks `auth_date` freshness, then issues a session. Never trust `initDataUnsafe`.
- **Household scoping:** every table carries `household_id`, even though the MVP has one household per user.
- **Versioning:** each household has a monotonic `version` counter that every mutation bumps. Realtime events and `changes?since` both depend on it. The client calls catch-up on Mini App activation and on reconnect.
- **Offline ops:** client mutations carry idempotent client-generated ids, so the backend must accept replays safely.
- **Conflict rules are per operation type, not last-write-wins:** a "checked" mark beats an "unchecked" that happens at nearly the same time; delete beats edit; two concurrent adds of the same item merge.
- **Catalog vs list:** `item` is the household catalog (normalized name, category, purchase stats). `list_entry` is an item placed on a list, with a free-text description. Adding an item that is already on the list must not create a second row.
- **Never block adding:** category, unit and store are never required. Unknown items go to "Без категории". Category is guessed from an RU/ES dictionary, with an LLM considered later.
- **Input parsing:** one line can hold several items, split by `;` or a newline. A comma splits name from description (`молоко, 2 л`). Pasting multiline text adds every line. Search ignores case and diacritics (`platano` = `plátano`) and tolerates one typo.
- **Store ordering:** `store_category_order.is_manual = true` freezes the order, and the learned order from `checkout_log` must not override it.
- **Telegram client:** call `ready()`, `expand()` and `disableVerticalSwipes()` at startup, because swipes on list rows must not close the app. Use only `--tg-theme-*` colors; a custom palette is allowed only for category icons. Turn on `enableClosingConfirmation()` only while offline ops are pending. Every destructive action needs Undo (at least 5 s) or a `showConfirm`.

## Staging

The MVP covers Telegram login, one household with link invites, one list, input with suggestions, dictionary categories, checking with Undo, "Недавно купленные", realtime, Telegram themes, and RU/ES. Stores and their ordering, in-store mode, multiple lists, the offline queue and bot notifications come next (see spec §9). Don't build later-stage features unless asked.
