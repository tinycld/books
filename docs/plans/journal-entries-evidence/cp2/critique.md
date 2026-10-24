# Critique — checkpoint 2 "Entries list header and states" (round 1)

Scope: the `/a/books/entries` route with header, search, status chips, date range, loading, error, both empty states, and the sidebar and New menu entries switched on. The ready list shows plain memo rows at this checkpoint; the table, cards, row menu, status badges and totals are checkpoint 3 and are not findings.

Compared against: `journal-entries-reference/` list-empty-1280-{light,dark}, list-no-match-1280-light, list-no-match-390-light, list-empty-390-light, list-1280-light (header only); `docs/specs/journal-entries-design.md`; `journal-entries-checkpoints.md` checkpoint 2; the sibling Books screens (Chart of Accounts toolbar, register header and empty states).

## State check

All 12 shots show the state their name says. None is INVALID.

- list-{1280,390}-{light,dark}: header with "New journal entry", empty search, All selected, "This fiscal year"; a column of seeded memo rows (Entries seed auto reverse, Void of 13, ... Laptop). Populated.
- list-empty-{1280,390}-{light,dark}: same header; body "No journal entries yet" + "New journal entry". Empty (no entries at all).
- list-no-match-{1280,390}-{light,dark}: search "zzzz-no-such", All selected; body "No entries match" + "Clear filters". Filter matched none.

## Findings

- list-1280-light: toolbar — status chips are 44pt-tall pills while the Chart of Accounts toolbar (`AccountToolbar.tsx` FilterChip, `minHeight: 32`, `py-1`) and the reference use 32pt chips; the two Books list screens now carry two chip sizes. The checkpoint plan asks for 44pt ("chips All, Draft, Posted, Void (`entries-chip-<id>`, 44pt)"), so the size is a decision, but the sibling screen was not brought along — NOTE.
- list-1280-dark: same chip-size inconsistency — NOTE.
- list-390-light: toolbar — the wrapped row (four 44pt chips, then the range control on its own line) ends at y≈235, so the first row starts 28% down an 844pt screen; the reference header ended at ≈190 with the same wrap. Follows from the 44pt chip decision — NOTE. Body — the shell's New FAB sits at bottom right while the header also shows "New journal entry": two entry points to the same action on one screen. The FAB is the shell's phone New menu (now populated because `journal-entry` became available), and the list scroller has FAB clearance, so nothing is hidden — NOTE.
- list-390-dark: same two NOTEs.
- list-empty-1280-light: body — the reference empty state carried a one-line explanation ("Manual entries move money between accounts when the ledger has no matching form.") under the heading for a writer; the build shows heading + button only. The spec gives the explanation to read-only users ("'New journal entry' for writers, a one-line explanation for read-only users") and the plan fixes that copy, so the writer view follows the spec; the state is thinner than the approved reference, like the register's empty-range state — NOTE.
- list-empty-1280-dark: same — NOTE.
- list-empty-390-light: same explanation NOTE, plus the 44pt-chip header height NOTE from list-390 — NOTE.
- list-empty-390-dark: same — NOTE.
- list-no-match-1280-light: nothing found.
- list-no-match-1280-dark: nothing found.
- list-no-match-390-light: header height NOTE as list-390 — NOTE.
- list-no-match-390-dark: same — NOTE.

Not findings (checked): the date range is a `PickMenu` with a chevron (bordered, rounded-md) rather than the reference's pill chip; it is the same `PickMenu` the register uses (`RegisterRangeSelect.tsx`, `size="touch"`) and it stays in the chip row where the reference put it, so the detail lives in the same place. Header sits outside the `ScrollView` (spec: "Header (outside the scroll area)"). Search placeholder "Number or memo" matches the spec. "No journal entries yet" / "No entries match" / "Clear filters" copy matches the spec; heading weight (`text-base font-medium`) and button sizes match the register's empty states. The sidebar entry "Journal Entries" is Title Case like "Chart of Accounts" and the "+ New" sidebar button appears because the New action is now available (Delivers line). Plain memo rows are 44pt apart (`py-3` + text-sm), left-aligned with the title, no separators: that is the checkpoint-2 stand-in the Delivers line names. Light and dark are both legible: active chip is primary with primary-foreground text, outlined chips keep `text-foreground`, search border and range border are visible on the dark background. No text wraps or truncates badly; no horizontal overflow at 390. The empty state appears under the default "This fiscal year" range: the plan decides the default range counts as no filter.

Not captured, so not reviewed: loading (`LoadingState`), error ("Could not load journal entries" + Retry), and the read-only empty state (seed has no read-only member). These are in the Delivers line; the next capture should add `loading`, `error` shots (an `error` shot can use the same `route.fulfill({ status: 400 })` the e2e uses).

## Summary

0 BLOCKING. 3 NOTE themes: 44pt chips differ from the Chart of Accounts 32pt chips (and push the phone header taller); the writer empty state drops the reference's explanation line (spec-compliant); phone shows both a header button and the shell FAB for the same action. Checkpoint 2 passes design review.
