# Checkpoint 4 — gate 2 critique

Critic: fresh subagent (model fable). Built shots: this directory; reference: ../../transfer-reference/ (posted, reader, not-found, loading, error) and, for the type labels, ../../journal-entries-reference/list-1280-light.png and ../../account-register-reference/populated-drawer-1280-light.png.

## Pass 1 (all shots)

Verdict: no BLOCKING findings. Two NOTEs.

### State check
- posted-1280-light / -dark / posted-390-light / -dark — VALID. Posted TR-1 read-only: back link, "Transfer TR-1", Posted badge, help icon, $1,500.00 as the big figure, band with 1000 Business Checking → 1010 Business Savings (ArrowRight wide, ArrowDown phone), Date, Memo, "Posted by Test User, Nov 5, 2026, 1:55 AM", "View journal entry". No action bar (checkpoint 6).
- reader-* (4) — VALID. Same read view, no "+ New", no actions. A core "Reconnecting…" pill sat over the header in all four (see NOTE).
- not-found-* (4) — VALID. "← Journal entries" and "This transfer does not exist".
- loading-* (4) — VALID. Centred LoadingState spinner.
- error-* (4) — VALID. "Books could not load this transfer." with Retry.
- list-1280-light — VALID. Journal Entries list filtered to the seed memo; row Nov 5, 2026 · TR-1 · Transfer · Seed transfer to savings · Posted · $1,500.00.
- populated-drawer-1280-light — VALID. Business Savings register, TR-1 row Type "Transfer", drawer open with Type "Transfer", "Open entry", two lines.

### Findings
- posted-*: nothing found.
- reader-1280-light / -dark: header, top centre — a core "Reconnecting…" realtime pill overlaps the header row — NOTE (capture artifact: `fakeRecords` aborts realtime).
- reader-390-light / -dark: header — the same pill covers the end of the "Journal entries" back link — NOTE (same cause).
- not-found-*, loading-*, error-*: nothing found (identical to the reference).
- list-1280-light: nothing found (Type "Transfer" and TR-1 in the same columns and weights as "Journal entry" rows).
- populated-drawer-1280-light: drawer, "Open entry" link — the label is generic for a transfer; "Open transfer" would say what opens — NOTE (spec names the action "Open"; no rule broken).

## Action
- Reader pill: capture problem fixed at the source — capture.json's reader shot gains `"hideLabels": ["Reconnecting…"]` (the core ConnectionIndicator's accessibilityLabel), and the four reader shots were re-captured.
- "Open entry" label: NOTE, to Design notes.

## Pass 2 (re-captured reader shots, fresh critic, model fable)
- reader-1280-light / -dark / reader-390-light / -dark — VALID. Nothing found: back link, title, badge, help icon, amount, band, stamp and link match the reference structure; legible in both schemes; phone layout matches. No BLOCKING, no NOTE.
