# Gate 2 critique — checkpoint 5 (Transfer form, save and post)

Critic: fresh subagent on fable. Built set: new, filled, errors-blank, errors-same, draft, no-access × 390/1280 × light/dark (24 shots), from `capture.json` in this directory. Reference: `docs/plans/transfer-reference/`.

## State check

- new (all four): VALID. Empty form, "New transfer", Draft badge, help icon, "—" figure, both pickers "Choose an account", blank amount, today's date, blank memo, action bar (wide: Cancel / Save draft / Post & new / Post; phone: Cancel / Save draft / Post / More).
- filled (all four): VALID. From 1010 Business Savings with "Balance $1,500.00", To 1000 Business Checking with "Balance $24,121.00", amount "$1,500.00" (post-blur currency form, not counted per the plan decision), memo text, "$1,500.00" as the header figure.
- errors-blank (all four): VALID. Post pressed on an empty form; inline errors on From, To and Amount; Date untouched.
- errors-same (all four): VALID. 1000 Business Checking on both sides, "Choose two different accounts" under To, 20,000,000,000,000.00 with "The amount is too large", "Too large" in the header, 2026-11-31 with "Enter a date as YYYY-MM-DD".
- draft (all four): VALID. "Draft transfer", Draft badge, "$1,250.00", 1000 Business Checking → 2100 Company Card with balances, memo. No More button on wide (a later checkpoint).
- no-access (all four): VALID. "← Journal entries" back link and "You need bookkeeper access to create transfers". No "+ New" in the sidebar for the read-only user (spec: "the + New menu already hides for non-writers").

## Findings

- new: nothing found.
- filled: nothing found. (Memo focus ring is a capture artifact. No negative balance in the built data, so the `text-danger` balance is not shown in this set.)
- errors-blank: nothing found.
- errors-same: nothing found. (Date error ~4 px higher than the reference; no rule.)
- draft: action bar (phone, light and dark) — "Save draft" drawn in its tinted hover/pressed style while the other buttons are at rest; the wide shot does not show it. Most likely the pointer still over the button after the capture's click, since the replaced screen draws the bar at the same spot. Confirm it is pointer hover and not a stuck pressed/focus state after the route replace — NOTE.
- no-access: nothing found.

No BLOCKING findings.
