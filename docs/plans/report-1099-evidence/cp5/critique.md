# Design critique: report-1099, checkpoint 5 (Entry points, phone rows, help)

Result: 0 INVALID, 1 BLOCKING, 5 NOTE.

Read: 26 built shots (cp5), 16 reference shots, the brief, the spec, the lessons, `memories-design.md`.
Names, figures and the business name differ from the reference (seeded book, D8). They are not findings.
In the built report shots the Books tab is not active, because the shipping route is core's. It is not a finding.

## Report on a phone (reference pairs)

### populated-phone-390-light, populated-phone-390-dark
State check: valid. Populated, Show = All 1099 vendors, vendors open, boxes closed.
- Label on line 1, Reportable / Excluded / All payments on line 2, as the reference. The long Willamette label clamps at three lines. No figure is cut. Excluded is blank where zero. The Total row is the heaviest line. Light and dark are legible; the inactive vendor is muted and readable.
- populated-phone-390-*: param chip row — the row is scrolled sideways, so the Period chip is cut at the left edge ("riod: This calendar year") and its calendar icon is not in view; the reference shows the row at its start — NOTE (capture effect of the press on the Show chip; no rule).

### populated-phone-375-light, populated-phone-375-dark
State check: valid. Same state at 375.
- Same structure as 390. Three figures fit one line; none is cut. The Willamette label ends "Cleaning & …" as the reference.
- populated-phone-375-*: param chip row — same scrolled chip row as at 390 — counted in the NOTE above.

### opened-phone-390-light, opened-phone-390-dark
State check: valid. The box "NEC 1 · Nonemployee compensation" of Jamal Okafor is open with two payment rows.
- Payment rows: label wraps to two or three lines above the figures, regular weight, indented under the box, as the reference. Figure columns line up with the group rows. "· paid by card" shows on the card row. No sideways scroll.
- Chip row scrolled: counted in the NOTE above.
- Nothing else found.

### opened-phone-375-light, opened-phone-375-dark
State check: valid. Same state at 375.
- Nothing found (chip row: NOTE above).

### untracked-phone-390-light, untracked-phone-390-dark
State check: valid. Show = Not tracked for 1099; header line "Vendors: Not tracked for 1099"; Metro Commercial Properties is in view.
- untracked-phone-390-*: bottom of the shot — the list is longer than the 1300 px shot, so the last rows and the Total row are below the tab bar; the reference shows the list to its Total and "End of report" — NOTE (capture height, not the build; the Total row is proved by the populated shots).
- Row structure, muted inactive vendor (Coastal Coffee Roasters), negative figures (-150.00) and blank Excluded read correctly in light and dark.

### empty-phone-390-light, empty-phone-390-dark
State check: valid. Custom period January 1 – January 31, 2020, no rows.
- "No rows for January 1 – January 31, 2020" with the action "Show this calendar year" (plan D3; the reference's "Show this fiscal year" is the older label). Header lines and the Refresh band are present. Nothing found.

### loading-phone-390-light, loading-phone-390-dark
State check: valid. Spinner under the title band.
- loading-phone-390-*: under the chip row — the band "This report does not update by itself. Press Refresh to see new changes." with Refresh is absent; the reference shows it in this state — NOTE (core's report view before the first run lands; the brief says this state is "as in checkpoint 2", which I did not see; no checkpoint 5 Delivers text covers it).

### error-phone-390-light, error-phone-390-dark
State check: valid. "Could not load this report" with Retry.
- error-phone-390-*: same absent Refresh band as loading — counted in the NOTE above. Retry is present, so the state is complete.

## Entry points (no reference, D10)

### vendors-reports-menu-1280-light, vendors-reports-menu-1280-dark
State check: valid. Reports menu open under the Reports button.
- Four items in the order Vendor Balance, A/P Aging, Expenses by Vendor, 1099 Summary and Detail. The new item has the same type, indent and row height as the three above it. The longest label fits the menu with no wrap. Light and dark are legible. Nothing found.

### vendors-reports-menu-390-light, vendors-reports-menu-390-dark
State check: valid. The menu is a bottom sheet "Reports" with the four items.
- Same order, same row style, no truncation. Nothing found.

### settings-1099-1280-light, settings-1099-1280-dark
State check: valid. 1099s section with the button and the three cards.
- "Open the 1099 report": outline, small, above the Reporting threshold card, left edge on the cards' left edge, 16 px to the card (the same gap as between the cards). Meets the Gates line. Nothing found.

### settings-1099-768-light, settings-1099-768-dark
State check: valid. 1099s section with the button and the three cards.
- The button meets the Gates line here too (above the cards, on the left edge, section gap).
- settings-1099-768-*: card "Accounts reported on 1099s", every row — the account name column is collapsed to nothing (no account name is in view; "Inactive" draws one letter per line), and each box select runs past the card's right border and is cut by the screen edge — BLOCKING (memory p1-chart-of-accounts: "a column must never collapse to blank (minWidth + ellipsis)"; memory p5-trial-balance: "Tablet width is fully supported: fix known tablet defects"). Scope: the defect is in the existing Accounts card, not in the button this checkpoint adds. The Gates line asks for this section at 768, so it is recorded. At 390 the same rows stack the name above the select; that arrangement is what this pane width needs.
- settings-1099-768-light: card "1099 vendors", first row — the vendor name is cut to one character beside the "Missing tax ID" badge (same cause: the pane is about 175 px wide) — part of the BLOCKING finding above.
- settings-1099-768-light vs -dark: left sidebar — the Books sidebar is about 250 px wide in light and about 185 px in dark, so the content pane differs between the two shots — NOTE (capture state; both shots show the defect).

### settings-1099-390-light, settings-1099-390-dark
State check: valid. Pushed screen "1099s" with the button and the three cards.
- The button is above the cards, on the cards' left edge, 16 px to the first card. Meets the Gates line.
- settings-1099-390-*: card "1099 vendors" — the floating New button covers the tax ID digits of the Keystone Legal Group row — NOTE (existing shell control over an existing card; scroll clears it).

## For gate 3
- opened-phone-*: the card payment row reads "2026-09-23 · Expense 1004 · 6210 Software Subscriptions:Design Tools · paid by card" with no description part. Plan D5 seeds this expense with the description "Seed 1099: design software by card". Check that the label reads the right description field (spec §3: "<date> · <type> <number> · <account> · <description>").
- untracked-phone-390-*: "Ironclad Equipment Rentals" shows with 0.00 Reportable and 0.00 All payments. Check that this is a vendor with payment rows that net to zero and not a vendor with no payment row (spec Q19).
