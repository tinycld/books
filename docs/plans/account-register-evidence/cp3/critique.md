# Critique — checkpoint 3 "Register route, header and states" (round 2)

Previous round: 1 BLOCKING (F1, "through <date>" sat under Opening balance) + NOTEs on label alignment, left-aligned wrapped explanation on phone, missing empty-range explanation line, error title at body weight, no secondary line in not-found. Re-checked after fixes on the re-captured populated/empty/empty-range/error shots (not-found was not in this round's list; its NOTE from round 1 stands).

Scope: route, header, non-table states, entry points. Table, sorting, phone cards, drawer and help are later checkpoints and are not findings.

## State check

All 16 shots show the state their name says. None is INVALID.

- populated-{1280,390}-{light,dark}: Business Checking, 1000, Bank · Checking, $23,700.00 → $25,100.00 through Oct 23, 2026, This month; no body (table is a later checkpoint).
- empty-*: Design Tools 6210, $0.00/$0.00, "No transactions yet" + explanation line, no New button.
- empty-range-*: Business Checking, Last fiscal year, $0.00/$0.00 through Dec 31, 2025, "No transactions in this range" + "Show this fiscal year".
- error-*: header with back link + title, no balances/range, "Could not load this register" + Retry.

## Fix verification

- F1 fixed on all 12 header shots: "through <date>" now sits directly under the Ending balance figure, as the reference and the spec ("The block is labelled 'through <range end date>'") require.
- Opening/Ending labels now share one top line on both widths; no new overlap or wrap.
- Phone empty explanation now wraps as a centered block under the centered heading.
- Error title is now semibold, the same heading style as the two empty-state titles.
None of the changes introduced a regression.

## Findings

- populated-1280-light: nothing found.
- populated-1280-dark: nothing found.
- populated-390-light: nothing found.
- populated-390-dark: nothing found.
- empty-1280-light: nothing found.
- empty-1280-dark: nothing found.
- empty-390-light: nothing found.
- empty-390-dark: nothing found.
- empty-range-1280-light: body — heading goes straight to the button; the reference carried "Pick a longer range to see earlier lines." and the sibling empty state has an explanation line, so this state is thinner and becomes a lone heading when "This fiscal year" is already selected — NOTE (carried from round 1).
- empty-range-1280-dark: same — NOTE.
- empty-range-390-light: same — NOTE.
- empty-range-390-dark: same — NOTE.
- error-1280-light: nothing found.
- error-1280-dark: nothing found.
- error-390-light: nothing found.
- error-390-dark: nothing found.

Not findings (checked): Opening and Ending figures sit at different baselines because the Ending figure is larger (spec: ending balance is the largest figure); Ending column is left-aligned inside its column as in the reference; Retry and back link are 44pt (decision); $0.00/$0.00 in empty-range is real seed data; light and dark both legible; no horizontal overflow at 390.

## Summary

0 BLOCKING. 1 NOTE theme (no explanation line in empty-range, carried over). Checkpoint 3 passes design review.
