---
name: Shared Lists
description: Shared shopping lists built from Telegram's own UI kit, with a small, tactile signature of our own.
colors:
  accent: "#3390ec"
  accent-text: "#ffffff"
  link: "#3390ec"
  ground: "#efeff4"
  section: "#ffffff"
  text: "#000000"
  hint: "#707579"
  subtitle: "#707579"
  section-header: "#707579"
  destructive: "#e53935"
  divider: "rgba(60, 60, 67, 0.2)"
  plain-fill: "rgba(0, 0, 0, 0.04)"
  accent-fill: "rgba(51, 144, 236, 0.1)"
  surface-dark: "rgba(56, 56, 56, 0.85)"
typography:
  large-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "41px"
  title1:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "24px"
  text:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "22px"
  subheadline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Apple Color Emoji', 'Helvetica Neue', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  tile: "9px"
  control: "12px"
  pill: "22px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-filled:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 24px"
  button-bezeled:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.link}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 24px"
  button-plain:
    textColor: "{colors.link}"
    height: "44px"
    padding: "0 12px"
  section:
    backgroundColor: "{colors.section}"
    rounded: "{rounded.control}"
  cell:
    backgroundColor: "{colors.section}"
    textColor: "{colors.text}"
    typography: "{typography.text}"
    height: "52px"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.section}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "11px 14px"
  chip-quick-add:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.link}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  category-tile:
    backgroundColor: "{colors.section}"
    rounded: "{rounded.tile}"
    size: "30px"
  snackbar:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "10px 16px 10px 10px"
---

# Design System: Shared Lists

<!-- TARGET: this file describes where the UI is going (a move onto @telegram-apps/telegram-ui, informed by docs/references/wishapp.md). Items marked "to implement" are not in the code yet; the rest is shipped in frontend/src/styles.css. -->

## Overview

**Creative North Star: "Telegram's own parts, our own hand"**

The interface is assembled from Telegram's official Mini App kit, `@telegram-apps/telegram-ui` (tgui): its Sections, Cells, Buttons, Placeholders, Snackbar, Skeletons and typography scale. The craft bar is the strongest kit-built Mini Apps (Wishapp, Wallet). A Telegram user should feel at home instantly, because the parts are literally the ones they already know. The kit also switches between iOS and Android grammar for us (`AppRoot platform`).

Our own hand shows in a few precise, tactile details layered on top of the kit, never in a palette or decoration. Those details are: the category emoji tile, the pen stroke that crosses an item out, the small pop of the check, the accent wash on a just-added row, and the trip progress hairline. The motion is calm and tactile. Each action gets one short physical response, and nothing moves under the finger. Density is comfortable, readable at a glance in a store aisle.

These outcomes are rejected: looking foreign inside Telegram, looking as dull as a notes app, looking toy-like, and looking cramped.

**Key Characteristics:**
- Built on tgui components and tokens. Custom CSS exists only for our signature details and gaps in the kit.
- Every colour comes from Telegram `themeParams`, so light, dark and custom themes follow the client, as in Wishapp. One guard: Sections always stand out from the ground.
- Native chrome stays native: `MainButton` for «Куплено (N)», `BackButton` for depth, `showConfirm` for destructive confirmations, `HapticFeedback` on every state change.
- Grouped inset sections, one per Category, with the emoji tile as the only color we own.
- One short, tactile response per action. The Still Row rule is absolute.

## Colors

The palette is borrowed, not chosen: Telegram's theme, bound as the `--tg-theme-*` variables and read through our tokens and tgui's. The frontmatter hex values are the light-theme fallbacks, used only when the client sends no key. Like Wishapp, the app does not trust a theme blindly: when the section colour is too close to the ground (pure-black night themes), `telegram.ts` mixes the section surface a little towards white or black so fields never vanish.

### Primary
- **Telegram Accent** (`--tgui--button_color` ← `--tg-theme-button-color`): filled buttons, the filled check, progress fill, focus outline and the new-row wash (22% mix). The native MainButton takes the same colour automatically; Telegram's header and background take the ground (`secondary_bg_color`).
- **Link Accent** (`--tgui--link_color`): plain and bezeled buttons, quick-add chips, «Add ⊕» in section headers, and snackbar actions.

### Neutral
- **Screen Ground** (`--tgui--secondary_bg_color`): the page behind sections and fields, and the sticky composer band.
- **Section Surface** (`--tgui--section_bg_color`): Sections, the composer input, suggestion panels and alerts.
- **Primary Text** (`--tgui--text_color`): Product names and titles.
- **Hint** (`--tgui--hint_color`): Notes, counts, timestamps, placeholders, and checked rows.
- **Subtitle** (`--tgui--subtitle_text_color`): Cell subtitles and meta lines.
- **Section Header** (`--tgui--section_header_text_color`): Category headers.
- **Destructive** (`--tgui--destructive_text_color`): delete, leave and forget.
- **Divider** (`--tgui--divider`): hairlines between Cells, inset to the text.
- **Plain Fill / Accent Fill** (`--tgui--plain_background`, `--tgui--secondary_fill`): gray and bezeled buttons and pressed backgrounds.
- **Dark Surface** (`--tgui--surface_dark`): the Undo snackbar, with a 28 px backdrop blur.

### Named Rules
**The Borrowed Palette Rule.** No colour literal appears in UI code except as a fallback inside `var()` (and the contrast guard's white/black mix). If a colour is not a Telegram theme value or one of our tokens built on them, it does not belong on the screen.

**The Emoji Is the Brand Rule.** Category emoji are the only colour we supply. No gradients, covers or illustrations.

## Typography

**Font:** tgui's platform stack (`system-ui`, SF on iOS, Roboto on Android) with Apple Color Emoji for the Category tiles.

**Character:** neutral and native. Hierarchy comes from tgui's scale and weights (700 / 600 / 400), never from a second family.

### Hierarchy
- **Title 1** (700, 28 px / 34 px): the List name in the header and screen titles. Use tgui `Title level="1"`. The shipped code uses 28 px with −0.01em tracking.
- **Headline** (600, 19 px / 24 px): Placeholder headers (empty states, error screens).
- **Text** (400, 17 px / 22 px): Product names in Cells and inputs. A 600 weight marks the current List and button labels.
- **Subheadline** (400, 15 px / 20 px): Notes, meta lines, snackbar text, alert text, and hints.
- **Caption** (400, 13 px / 16 px): Category section headers in caps with +0.02em tracking, field labels and field hints.

### Named Rules
**The One Family Rule.** Only the platform system font. Emphasis is weight, not a new typeface or size outside the tgui scale.

## Layout

A single column at phone width (360 px minimum). From top to bottom:
- the header: List name as the switcher, an AvatarStack for Members, and a "⋯" IconButton for the menu;
- the trip progress line;
- a sticky composer on Screen Ground;
- one Section per Category;
- the native MainButton, which lives outside the page.

The page gutter is 16 px. Sections are 20 px apart. A Cell is at least 52 px tall, and every control is at least 44 px. The top and bottom padding add Telegram's content and safe-area insets (`--tg-viewport-*`). Spacing steps are 4 / 8 / 12 / 16 / 20 / 24 px.

Navigation is at most two levels deep: the List, then an Entry, the Lists (switcher), Members, History or Settings. Depth is shown by the native BackButton, and there are no breadcrumbs. Naming forms (new List or Store, rename) are screens too. The app has no drawers at all: a choice of actions is Telegram's native popup (a Store's rename/delete), a confirmation is `showConfirm`, and the List menu is a popover.

### Named Rules
**The No Drawers Rule.** No bottom sheets or drawers, anywhere: forms are screens, action choices are native popups. On iOS a fixed drawer and the keyboard fight over the position (the Entry card flew off-screen in v0.2.0–0.2.1, the new-Store sheet in v0.3.0), while a plain page lets the WebView scroll the focused field into view. Wishapp has none either.

**The Still Row Rule.** Checking, unchecking, syncing and failing never move, reorder or resize a row. Feedback floats (snackbar, alert) or happens inside the row.

**The Aisle Reach Rule.** Primary actions sit at the bottom (MainButton, snackbar Undo) or in the row itself. No primary action lives only in the top bar.

## Elevation & Depth

Flat, with tonal layering: Section Surface on Screen Ground, as in Telegram settings. Sections, Cells and tiles have no shadows. Elevation is reserved for things that float above the flow:
- **Alert** (`0 4px 20px rgba(0,0,0,.16)`): connectivity and failure alerts pinned to the top.
- **Suggestions** (`0 0 0 .5px` divider ring): the panel that overlays rows under the composer.
- **Snackbar**: tgui's dark translucent surface with a 28 px backdrop blur instead of a shadow.

### Named Rules
**The Float-Only Shadow Rule.** A shadow means "this is above the list and will go away". Nothing that stays put casts one.

## Shapes

The kit's forms, unmodified:
- **12 px** (`control`): Sections, buttons, inputs and the snackbar.
- **22 px** (`pill`): quick-add chips.
- **9 px** (`tile`): squircle-ish Category emoji tiles.
- **Round**: checks, avatars (with a 2 px ring in the surface color, overlapping by 8 px in stacks), and the done badge on a tile.

Hairline dividers start at the text: on Entry rows 54 px on iOS (16 padding + 22 check + 16 gap) and 70 px on Android (24 + 22 + 24), following tgui Cell; 16 px elsewhere.

## Components

Every component is a tgui component unless marked custom. Character: **calm and tactile**. A press darkens or ripples, as the platform does, and a state change gets one small physical beat.

### Buttons
- **Primary action:** the native **MainButton**, not a tgui Button. «Куплено (N)» shows only while something is checked, and its label changes in place without hiding and showing again.
- **Filled** (`Button mode="filled" size="l" stretched`): in-page primaries such as the empty-state action, and Save outside Telegram. Accent background, 48 px, 12 px corners, disabled at 50% opacity until the form changes (to implement for explicit-save forms).
- **Bezeled** (`mode="bezeled"`): secondary actions next to a primary (Share link next to Members, Cancel outside Telegram).
- **Plain** (`mode="plain"`): snackbar Undo, alert Retry, and «Add ⊕» in a section header.
- **IconButton** (`mode="plain"`, 44 px hit area): the "⋯" List menu and the "›" Entry opener.
- **Press:** iOS gets an opacity press (tgui Tappable), Android a ripple (`scale 1→8`, `.3s cubic-bezier(.3,.3,.5,1)`). We never add our own scale-on-press.

### Chips
- **Quick-add chips** (custom): 44 px pills on Screen Ground with Link Accent text, centered and wrapping under the empty state. A tap adds the Product at once.

### Cards / Containers
- **Section** (`Section` with a `header`): one per Category. The header is caps Caption text with the emoji tile in front, the unchecked count, and optionally an «Add ⊕» plain button on the right (to implement). The footer is used for explanatory notes in Settings.
- **Placeholder** (`Placeholder`): empty List, empty History, errors and bad links. A large emoji or illustration slot, a Headline, a Subheadline description, and one action. An empty state always says what to do next. When behaviour depends on a setting, it adds an inline link to that setting.
- **Skeleton** (`Skeleton`): first load of a List (shipped) and each History page. It replaces the text-only "Loading…".

### Inputs / Fields
- **Composer** (custom, sticky): a borderless 44 px field on Section Surface with 12 px corners, growing to 120 px. Like Telegram's own fields, focus shows only the caret and no ring. Pasting multiline text adds every line.
- **Form fields** (`components/Field.tsx`, Wishapp's pattern): the label always visible above a native `input`, `textarea` or `select` (tgui's Input hides its header on iOS), a note below. The control sits on Section Surface with 12 px corners and a 1 px border that turns Link colour on focus; the caret is Link colour too. Errors turn the border and the note destructive.
- **Saving a form**: Telegram's MainButton with its own progress indicator; the BackButton leaves. Buttons are drawn on the page only outside Telegram. The Entry screen saves as you go and needs neither.
- **Entry name**: the Entry screen's title is the name and edits in place (a pencil marks it); there is no second name field.
- **Settings** (`Cell` with `Switch` / `Radio` and `description`): each option is a two-line Cell, title plus a one-line consequence ("Visible to everyone with a link").
- **Keyboard focus:** a 2 px Telegram Accent outline inset by 2 px with 10 px corners on every control. Pointer focus shows nothing.

### Navigation
- **Header** (custom): the List name in Title 1 is the switcher button (chevron after it). On the right, an `AvatarStack` of up to three Members (+N) opens Members, and the "⋯" IconButton opens the List menu. Under the name sits a Subheadline meta line ("3 участника · 5 из 12 в корзине").
- **BackButton** (native) for every nested screen.
- **List menu**: a popover from "⋯". It enters in `.12s ease-out` (opacity 0→1, scale .96→1, 4 px rise) and leaves in `.12s ease-in` with pointer events off.

### Entry Row (signature, custom Cell)
The heart of the product. A full-width toggle with a 22 px round check, the Product name in Text, and an optional Note in Subheadline/Hint below. On the right are the adder's 24 px avatar (shared Lists only) and a 44 px "›" that opens the Entry card.
- **Check:** the ring fills with Telegram Accent and a white tick draws in, with a pop `scale .82 → 1.08 → 1` over `.24s cubic-bezier(.22,1,.36,1)`.
- **Cross-out:** a 1.5 px pen stroke draws across the name from left to right over `.22s` on the same curve, and undraws on uncheck. The name and Note fade to Hint, and the Note is struck through.
- **New row:** an accent wash (22% mix) fades to nothing over `1.6s ease-out`, so the eye finds what just arrived, including another Member's adds.
- **Haptics:** selection on toggle, success on «Куплено», error on failures.

### Category Tile (signature, custom)
A 30 px tile with 9 px corners on Section Surface, holding the Category emoji at 18 px. When every Entry in the Category is checked, the tile pops (`scale 1 → 1.12 → 1`, `.32s`) and earns a 12 px accent check badge at its bottom-right corner, ringed in Screen Ground.

### Trip Progress (signature, custom)
A Subheadline line ("5 из 12") above a 3 px hairline track (Hint at 22%) whose accent fill scales from the left over `.35s cubic-bezier(.22,1,.36,1)`. When full, the text turns Telegram Accent at 600 weight.

### Tips
- **Tip** (`Banner`, with our own close button): a one-time onboarding card pinned to the bottom, so showing it never moves a row. There is one at a time: multi-add in an empty List, invite after the first adds, «Куплено» on the first check. Each closes for good through `POST /api/me/tips/{key}/dismiss`, and also once the user does what it teaches. The screen reserves room for the Tip's measured height (`--tip-height`, written by `Tip.tsx`), so the last row is never hidden.

### Snackbar and Alerts
- **Undo snackbar** (`Snackbar` with `Snackbar.Button`): Dark Surface with blur, 10 px from the edges, at most 460 px wide. It slides up from `translateY(140%)` over `.34s cubic-bezier(.3,.3,.5,1)` and lasts at least 5 s. The text clamps at two lines so the removed item's name fits. Every destructive action has one.
- **Alert** (custom): failures and offline status, pinned to the top on Section Surface with the float shadow. It has a plain Retry and a close button, and never pushes rows.

## Do's and Don'ts

### Do:
- **Do** build screens from tgui (`AppRoot`, `List`, `Section`, `Cell`, `Button`, `IconButton`, `Placeholder`, `Snackbar`, `Skeleton`, `AvatarStack`, `Switch`, `Radio`) before writing custom CSS; form fields use `Field` with native controls.
- **Do** wrap the app in `AppRoot` with `platform` and `appearance` from the Telegram launch params, so iOS and Android each get their own grammar.
- **Do** keep MainButton, BackButton, `showConfirm` and HapticFeedback native, even where tgui offers an HTML alternative.
- **Do** keep every motion at or under `.35s` (the 1.6 s new-row wash is the one exception), on `cubic-bezier(.22,1,.36,1)` for our details and tgui's `cubic-bezier(.3,.3,.5,1)` for kit surfaces. Honour `prefers-reduced-motion` by cutting durations to `.01s`.
- **Do** give every Section header action and every setting a visible label. No gesture is the only way to do something.
- **Do** check every screen in light and dark Telegram themes, on iOS and Android, at 360 px.

### Don't:
- **Don't** add gradient covers, 3D illustrations, shine sweeps or any custom brand color, even though Wishapp uses them.
- **Don't** replace the MainButton with a sticky HTML button.
- **Don't** add a drawer or bottom sheet: a form is a screen, a choice is a native popup.
- **Don't** add page-transition animations. Screens swap instantly, and BackButton carries the depth.
- **Don't** scale an element on press, or move, reorder or resize a row in response to a state change.
- **Don't** add breadcrumbs. Two levels of depth do not need them.
