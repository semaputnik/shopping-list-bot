---
target: главный экран списка
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/semaputnikov/Documents/Projects/shopping-list-bot/frontend/src/screens/ListScreen.tsx"
target_fingerprint: "sha256:b2f2930bb6f21e115a9418668701163303f74d7e13db026f31a5ff5741f595f0"
target_path: /Users/semaputnikov/Documents/Projects/shopping-list-bot/frontend/src/screens/ListScreen.tsx
timestamp: 2026-11-09T02-32-46Z
slug: frontend-src-screens-listscreen-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

Target: frontend/src/screens/ListScreen.tsx (List screen), Operate mode. Seen in an emulated Telegram (iOS light/dark, 375×812); native MainButton/popups/haptics only emulated.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No offline/sync indicator; failed check stays checked while notice says «Список обновлён»; no "N left" |
| 2 | Match System / Real World | 3 | Good RU vocabulary; copy says «нажмите Enter» on phones; «Добавил(а)», «Участников: 1» clunky |
| 3 | User Control and Freedom | 2 | «✕ Убрать из подсказок» has no Undo; «Куплено» pressable under the Entry sheet |
| 4 | Consistency and Standards | 3 | Group headers use --hint not section_header_text_color; separators inconsistent; Share copies to clipboard |
| 5 | Error Prevention | 2 | Enter adds the raw fragment, not the first suggestion (spec §4); Удалить next to Закрыть; disabled item looks enabled |
| 6 | Recognition Rather Than Recall | 3 | «уже в списке» + quick-add chips good; Share hidden behind unlabelled avatars |
| 7 | Flexibility and Efficiency | 3 | Multi-add, Note syntax, keyboard nav; no swipes (OK for MVP) |
| 8 | Aesthetic and Minimalist Design | 3 | Clean; sparse lists fragment into one-item sections |
| 9 | Error Recovery | 2 | Errors are grey inline text, no retry/dismiss, shift the list |
| 10 | Help and Documentation | 3 | Empty state teaches syntax; nothing hints that tapping the name opens a card |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict
LLM: on direction (convincing Telegram settings grammar, theme-only colour, still rows, native popups), but not yet authored for this product: emoji tiny, "shared" story weak (identical blue initials, EntryAvatar unused), no trip progress; leans "dull like a notes app".
Detector: CLI 0 findings (colours live in CSS vars). Browser overlay: avatar initials and Закрыть 4.1:1 (Telegram button_color, false positive by design), .entry-card__meta 2.5:1 (theme hint, real in light), cramped-padding on .sheet-list (false positive). Missed by overlay but measured: Notes/checked names 2.85:1, group headers 2.48:1 in light — group headers use --hint instead of section_header_text_color (would be 4.49:1).

## Priority Issues
1. [P1] «Куплено (N)» MainButton stays visible/pressable over the Entry card sheet — ListScreen.tsx:519; fix: add `openId === null` to buttonVisible. (/impeccable harden)
2. [P1] Toggle target is a 48 px left column; tapping the name opens a modal — ListScreen.tsx:943-956, styles.css:650-674; fix: whole row toggles, card via trailing chevron/(i) 44 px. (/impeccable layout)
3. [P1] Error notices push the list down; no offline state; check silently lost when reload fails — ListScreen.tsx:870-885; fix: overlay toast with «Повторить», header sync status, revert/pending optimistic state. (/impeccable harden)
4. [P2] Enter adds the raw fragment, not the first suggestion — ListScreen.tsx:591-599/132; fix: default active=0 on match, highlight default, «Добавить «…»» first only when no match. (/impeccable clarify)
5. [P2] Shared-ness near-invisible: unlabelled identical avatars, Share two levels deep and clipboard-only, EntryAvatar unused — fix: «Поделиться» in List menu, Telegram share, 24 px EntryAvatar on rows. (/impeccable delight)

## Persona Red Flags
Casey: far-left toggle; autofocus raises keyboard on open (ListScreen.tsx:810); error shifts rows; «Куплено» under sheet; one-item sections.
Jordan: «нажмите Enter»; no visible Add button; unlabelled avatars for sharing; ✕ on suggestions looks like delete and has no Undo; disabled item looks tappable; flat 7-item menu with destructive items inline.
Sam: hint text ~2.5–3.3:1 in light themes for Notes, headers, checked items; row__open lacks an accessible hint; checkbox label omits Note; no custom :focus-visible.

## Minor Observations
Long list names truncate at 28 px; long Notes wrap ragged; group counts include checked items; 13 px emoji; separators inset under the check and full-width in sheets; duplicate .composer rule; «· вы» dangling in Members; native <select> without emoji for Category; no editable name / move-to-list in the card; delete snackbar truncates the name.

## Questions to Consider
- If the emoji is the only colour you own, why is it the smallest thing on screen?
- Is the end of a trip a toast or a moment — what should the other Member feel?
- Should a 15-item list really be 9 sections?
