---
name: Shared Lists
description: Shared shopping lists that look and behave like a native part of Telegram.
---

<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Shared Lists

## Overview

**Creative North Star: "As if Telegram shipped it"**

The interface is the category standard, executed without irony. It should look like a screen Telegram itself built, not a website in a webview. The craft bar is Telegram's native screens and the Wallet Mini App. Any element a Telegram user would not recognize has to justify itself.

The product character lives in precise details, not in decoration. Those details are: category emojis as the only color of our own, generous one-handed tap targets, state changes that never move a row under the finger, and native controls (MainButton, BackButton, haptics, popups) used wherever Telegram offers them. Density is comfortable rather than compact: it should be readable at a glance in a store aisle.

The user rejected these outcomes: looking foreign inside Telegram, looking as dull as a notes app, looking toy-like, and looking small or cramped.

**Key Characteristics:**
- Theme-driven: every UI color comes from Telegram `themeParams`, so light and dark follow the client automatically.
- Inset grouped sections, one per Category, in Telegram's settings-screen grammar.
- Native chrome first: MainButton for «Куплено (N)», BackButton for sheets and nested screens, `showConfirm` for destructive actions, HapticFeedback for every state change.
- Emoji carry Category identity, and type and layout carry everything else.

## Colors

Restrained: Telegram's neutrals plus Telegram's own accent. The palette is not ours to choose.

### Primary
- **Telegram Accent** (`--tg-theme-button-color`): the MainButton, the active check and the input caret. Links use `--tg-theme-link-color`.

### Neutral
- **Screen Ground** (`--tg-theme-secondary-bg-color`): the page background behind grouped sections.
- **Section Surface** (`--tg-theme-section-bg-color`, falling back to `--tg-theme-bg-color`): Category sections, the input and sheets.
- **Primary Text** (`--tg-theme-text-color`): Product names and titles.
- **Hint Text** (`--tg-theme-hint-color`, or `--tg-theme-subtitle-text-color` where available): Notes, counts, timestamps and placeholder text.
- **Section Header** (`--tg-theme-section-header-text-color`): Category header labels.
- **Destructive** (`--tg-theme-destructive-text-color`): delete and leave actions.
- **Separator** (`--tg-theme-section-separator-color`): hairlines between rows.

### Category Emoji
- The emoji themselves are the only color we supply. Exact emoji per Category: [to be resolved during implementation].

### Named Rules
**The Borrowed Palette Rule.** No hex value is written into UI code except as a fallback for a missing `themeParams` key. If a color is not a Telegram theme variable, it does not belong on the screen.

## Typography

**Body Font:** the platform system stack Telegram itself uses (`-apple-system`/SF on iOS, Roboto on Android).

**Character:** neutral and native; the type should disappear into Telegram.

### Hierarchy
- Exact sizes, weights and line heights: [to be resolved during implementation, matched against Telegram's native screens on iOS and Android].
- Product names are the largest text in a row. Notes sit below them or to the side, smaller and in Hint Text.
- Category headers follow Telegram's section header convention.

## Layout

Single column at phone width (360 px minimum) with Telegram's grouped inset sections. The order is: header (list name, avatar row), a pinned input, Category sections, and the MainButton outside the page. Safe-area and content-safe-area insets are respected. Exact spacing scale and row height: [to be resolved during implementation; rows must be comfortable one-handed tap targets].

### Named Rules
**The Still Row Rule.** Checking or unchecking never moves, reorders or resizes a row. Only its content changes.

## Elevation & Depth

Flat, with tonal layering. Depth comes from Section Surface sitting on Screen Ground, as in Telegram settings. No shadows on rows or sections. Bottom sheets and popups use Telegram-native presentation where it exists.

## Shapes

Telegram's native forms: inset sections with rounded corners matching the platform (exact radius [to be resolved during implementation]), round check marks, circular avatars that overlap in the header row, and hairline separators inset from the leading edge.

## Do's and Don'ts

### Do:
- **Do** take every color from `--tg-theme-*` variables, with fallbacks only for missing keys.
- **Do** use the native MainButton for «Куплено (N)», shown only while at least one Entry is checked.
- **Do** keep a checked Entry in place, crossed out, with its check filled in Telegram Accent.
- **Do** check every screen in both Telegram themes, on iOS and Android, at 360 px.

### Don't:
- **Don't** introduce a custom palette, brand color or gradient; Category emojis are the only color of our own.
- **Don't** draw custom chrome where Telegram has a native control (top bars, bottom action buttons, back arrows, confirm dialogs).
- **Don't** shrink rows or text for density; small and cramped was explicitly rejected.
- **Don't** add mascots, playful illustrations or bouncy motion; toy-like was explicitly rejected.
