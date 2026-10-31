# vendor-1099 — helix run ledger

- mode: unattended
- unit: p3-vendor-1099
- started: 2026-10-30
- package branch: books/p3-vendor-1099   core checkout: books/p3-vendor-1099 (from core main 1bda334)
- spec: docs/specs/vendor-1099-design.md
- checkpoints: docs/plans/vendor-1099-checkpoints.md
- reference: docs/plans/vendor-1099-reference/
- evidence: docs/plans/vendor-1099-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/vendor-1099-capture.json
- review mode: C — none (unattended)
- core extension: audit `CollectionConfig.Redact` — tinycld PR (pending, branch books/p3-vendor-1099); checkpoint 0, merges before checkpoint 1; no `exclusive` (small core change)
- sparks:
  - Each account's 1099 box is readable at a glance in one list → expressible (`SectionCard`, rows `border-b border-border`, core `SelectInput` per row, inactive `opacity-60`)
  - A missing tax ID stands out without opening the vendor → expressible (chip `rounded-full bg-warning-soft px-2 py-0.5`, `text-xs text-warning-soft-foreground`)
  - Keep tax IDs out of the audit log values → needs extension (accepted)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
(none yet)

## Out-of-plan changes
(none yet)

## Phase notes
- design gate (2026-10-30, books 91ce648, core 1bda334): direction A (Settings → 1099s, one row per expense account with a box select that saves on choose). Packet open questions Q1-Q15 accepted as recommended. Q16 overlap: p2-products-services (lane default) owns `HostSelect` and moves it to `forms/account-fields.tsx`; the human chose to build now — import it from where it lives on main at build time, else only add `export` in `forms/vendor-fields.tsx`; the unit that merges second fixes the import. Needs-extension audit `Redact` accepted (core checkpoint 0). No [platform] items. Packet: ~/tmp/tinycld/auto-helix-books/staging/p3-vendor-1099/packet.md; artboards: same folder, artboards.html.
- phase 3 (2026-10-30, unattended, no human corrections): direction A. Sparks dropped: none. Spark "missing tax ID stands out" kept with other classes: global.css defines no `warning-soft` token, so the spec's `bg-warning-soft` / `text-warning-soft-foreground` chip drew no fill (dark text on dark); the chip is now `rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5` with `text-xs font-medium text-foreground` (core PendingBadge's fill, foreground text). Fixture: tinycld/books/lib/vendor-1099-fixture.ts (local `*1099Columns` interfaces until the migrations checkpoint replaces them with the generated types; 5 tracked vendors: Willamette EIN, Okafor SSN, Keystone Legal attorney, Greenline missing tax ID, Old Town Print inactive; boxes 6100 misc_1, 6200 none, 6210 nec_1, 6900 inactive misc_8; threshold 200000). Reference: docs/plans/vendor-1099-reference/ (capture manifest docs/plans/vendor-1099-capture.json), 390 and 1280, light and dark: settings-admin, settings-writer, settings-read-only, settings-refusal (6100 write pending, 6210 refused), settings-empty-accounts, settings-empty-vendors, settings-loading, settings-error, settings-list (390 only: the 1099s row and its summary), vendor-tracking-on (Keystone, EIN), vendor-tracking-off (Office Supply World). Unsure: (1) the section's place in the list: the route puts 1099s before Access, as artboard A does; the spec says only "a fifth entry". (2) Core SelectInput draws no disabled look, so the pending row in settings-refusal looks like the others. (3) The phone Settings scroller gets FAB clearance in the route (`useFabClearanceStyle`); the real SettingsShell has none, so the last vendor row can sit under the New FAB — the plan should add it in SettingsShell. (4) The vendor form route leaves out the contact and address fields and shows the New FAB at 390 (the real vendor page hides it). (5) Phone account rows indent the select with the label; wide rows indent the label only. (6) The threshold input is capped at 360 px wide.
- phase 4 (2026-10-30, unattended): plan docs/plans/vendor-1099-checkpoints.md, 8 checkpoints (0 core audit Redact; 1 columns/fixture/seed; 2 tax ID and box guards; 3 legal-name search + tax ID redaction; 4 vendor form fields; 5 Settings 1099s + threshold; 6 account box mapping; 7 1099 vendors card + help). E2E budget 12 of 12. Plan review (~/tmp/tinycld/auto-helix-books/staging/p3-vendor-1099/cp/plan-review.md): A1-A9, B1-B6, C1-C3, D1-D6, E1-E3, F1-F2 fixed (F3/F4 nothing). Driver rulings: F1 cp1 adds the 1099 keys only to EMPTY_VENDOR_COLUMNS (plus a `...EMPTY_VENDOR_COLUMNS` spread in useVendorForm insert that cp4 removes); A7 spec bullet now says the audit-log screen shows `[redacted]` (core screen already does; unchanged); threshold schema keeps text and `thresholdCents` converts (spec "Where it lives" updated); stale opening-balances scratch `tests/e2e/helix-states.spec.ts` moved out to staging (it broke tsc and matched -g helix). plan-check --unattended exit 0. review mode: C.

## Final review
- eval:
