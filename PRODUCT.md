# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The frontend is a Telegram Mini App built with React, Vite and TypeScript, using `@telegram-apps/sdk-react`. The backend is FastAPI on Python 3.14, managed with uv. A Telegram bot opens the Mini App and handles Share links.

## Users

The users are the author's family and close friends: Russian-speaking people living in Spain who shop together at Spanish supermarkets such as Mercadona and Lidl. Many are not technical. They open the app from a Telegram chat, often one-handed in a store aisle, to add what is missing at home or to cross items off while shopping. This is a personal project, not a public product.

## Product Purpose

People keep shared shopping lists inside Telegram, where they already talk, so they stop using notes apps or Bring!. Success means the circle actually uses it: adding an item takes at most two taps plus typing, and a change made by one Member appears for the others within one to two seconds.

## Positioning

It lives inside Telegram: no install, no account, no signup. A list is shared by sending a link in a chat, and joining takes one tap. It speaks Russian and Spanish natively, and its search treats «platano» and «plátano» as the same word.

## Operating Context

- Opened from a bot's menu button, an inline button or a Share link (`startapp`), inside the Telegram client on iOS and Android, and occasionally on desktop.
- Two scenes: at home (typing or pasting several items quickly) and in the store (scanning, crossing items off, pressing «Куплено» at the checkout).
- Lists are shared ad hoc. One person may share different Lists with different people.

## Capabilities and Constraints

- Domain vocabulary is in `GLOSSARY.md`: List, Member, Share link, Product, Entry, Note, Category, Checked, Purchase, History. Decisions are recorded in `docs/adr/`. The full UI spec is `docs/ui-spec.md`.
- Any Member can create, rename, leave or delete a List, and all Members have equal rights. Deleting a List needs a confirmation screen.
- Each List remembers its own Products and suggests them; suggestions never draw on other Lists. Duplicate Entries are allowed.
- A tap toggles an Entry between checked and unchecked. «Куплено» removes the checked Entries and records them as one Purchase in the List's History, which loads in pages.
- Telegram constraints: colors come from Telegram `themeParams`, so light and dark themes follow the client. Native `MainButton`, `BackButton`, `HapticFeedback` and `showConfirm` are used. Vertical swipes are disabled. There is no push; notifications arrive as bot messages.
- Languages: RU and ES, with EN optional, taken from Telegram `language_code`.
- Undecided: who owns stores (later stage).

## Brand Commitments

- The visual direction is the category standard: a native Telegram look, chosen deliberately over expressive directions. The craft bar is Telegram's own screens and the Wallet Mini App.
- The product is named **Shared Lists**. The name stays the same in every UI language. The bot's @username is not chosen yet.

## Evidence on Hand

None. There are no users, screenshots, testimonials or assets yet, and none should be fabricated.

## Product Principles

1. **Never block adding.** Free text is accepted immediately. Category, amount and store are never required.
2. **Feels like part of Telegram.** It follows the client's theme and native controls instead of standing apart as a separate app.
3. **Usable in the aisle.** It works one-handed and at a glance, nothing jumps under the finger, and every destructive action can be undone.
4. **Shared without ceremony.** A link is enough: no roles, no admins, no setup.
5. **Plain for non-technical people.** Every gesture has a visible alternative, and nothing needs explaining.

## Accessibility & Inclusion

The interface must work on 360 px screens and in both Telegram themes. Tap targets must suit one-handed use in a store. The UI must support RU and ES, including Spanish diacritics.
