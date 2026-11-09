---
version: 1
slug: "frontend-src-screens-listscreen-tsx"
primary_target: "frontend/src/screens/ListScreen.tsx"
related_targets: []
---

# Surface: List screen (main screen)

**Mode:** Operate. The Member adds items at home and crosses them off in the store.

**Task and states:** the input field with suggestions from the List's memory; Entries grouped by Category; the toggle crossing-out; «Куплено (N)» on the Telegram MainButton with a 5 s Undo; the Member avatar row in the header; the empty state; offline and sync indicators. Constraints: 360 px wide, one-handed use, Telegram light and dark themes, RU and ES.

**What would feel wrong:** looking foreign inside Telegram, looking as dull as a notes app, looking toy-like, looking small or cramped.

**Quality bar:** Telegram's native screens and the Wallet Mini App. Chosen by the user over expressive directions (canon, safer register).

## Direction contract

THESIS: The list is a native Telegram screen, as if Telegram shipped it. It refuses a "web app inside a webview": custom palettes, invented chrome, foreign controls.

OWN-WORLD: Every color comes from `--tg-theme-*`: `secondary_bg` for the ground, `section_bg` for grouped sections, `button_color` for the accent, `hint` for secondary text. Category emojis are the only color of our own. The system font is the one Telegram uses. Inset grouped sections have native radii and hairline separators.

STORY: The Member sees who shares the list and what is left to buy. They add an item in one keystroke and cross it off in one tap. «Куплено» closes the trip.

FIRST VIEWPORT: The header shows the list name and an overlapping avatar row (up to 4, then +N). Below it sits a pinned search-style input. Then come Category sections: a small caps-style section header with emoji and count, rows with a round check on the left, the name, and the Note in hint color. The MainButton «Куплено (N)» appears only while something is checked.

FORM: The category standard (canon), chosen by the user after a safer re-roll. Seed key 13ced2ec.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
