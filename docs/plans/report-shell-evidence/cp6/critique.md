# Gate 2 critique — checkpoint 6: Report screen frame and states

Run: `report-shell`, package books. Judged: the hub with Trial Balance available and the sidebar Reports entry (BarChart3), the report frame (header with back link, title, empty toolbar; control row with the period chip only; document header strip), the loading, error, empty and unknown states, and the hub loading and hub error states. Not judged: table, filters, Customize, period popover (later checkpoints).

Each shot was read at 390 and 1280, light and dark (32 images), against the matching reference where one exists.

## State check

| Shot | 390 light | 390 dark | 1280 light | 1280 dark | Shows |
|---|---|---|---|---|---|
| hub-v0 | valid | valid | valid | valid | Hub with one section "For my accountant" and the Trial Balance row; sidebar shows Reports (active) |
| tb | valid | valid | valid | valid | Ready frame: back link, title, period chip "Today · Oct 26, 2026", document header "Trial Balance / As of October 26, 2026"; body blank (table is checkpoint 8) |
| loading | valid | valid | valid | valid | Frame stays; `LoadingState` spinner in the body |
| error | valid | valid | valid | valid | Frame stays; "Could not load this report" + outline Retry |
| empty | valid | valid | valid | valid | Frame stays; "No balances as of January 31, 2000" + "Show end of last fiscal year" (as-of wording, as the Gates line states) |
| unknown | valid | valid | valid | valid | Back link only; "This report does not exist"; no controls, no document header |
| hub-loading | valid | valid | valid | valid | "Reports" heading + spinner; no section, no "No reports yet" |
| hub-error | valid | valid | valid | valid | "Reports" heading + "Could not load reports" + outline Retry |

No INVALID shots.

## Findings

hub-v0: nothing found. The sidebar Reports entry uses the BarChart3 icon at the same size, weight and colour as the Lists and Accounting entries, and the active state matches the shell's. Section heading, row title, description and chevron match the reference at both widths; the description wraps to two lines at 390 exactly as the reference does.

tb: document header strip — the business-name line is absent, so the strip shows only title and period where the reference shows "Harbor Lane Design LLC" above them — NOTE. The spec says the name is "omitted when blank" and the seed (`tinycld/books/seed.ts`) never writes `books_settings.business_name`, so this is data, not a defect. It does mean this gate did not see the strip's three-line form; the `report-business-name` line is only covered by the e2e "when it exists its text is not blank" check.

tb: nothing else found. Header order (back link above title), back link and chip at 44pt, chip at rest "Today · Oct 26, 2026" in the "<preset> · <dates>" form the spec requires, document header on `bg-card` with `border-y`, legible in both themes, no horizontal scroll at 390.

loading: nothing found. The header, chip and document header stay in place and the spinner sits in the body, matching the loading-* reference in both themes and widths.

error: nothing found. Alert text and outline Retry are centred under the strip, same placement and weight as the error-* reference; Retry is at least 44pt at 390.

empty: nothing found. Message in `text-base font-medium`, outline Button below it, same hierarchy as the empty-* reference; the as-of wording and action are the ones the spec gives for an as-of report.

unknown: nothing found. Matches the unknown-* reference exactly at both widths and themes.

hub-loading: sidebar — the "+ New" button is absent while the access read is held (it is present in hub-v0) — NOTE. The shell hides it until access resolves; it is shell behaviour, not part of this checkpoint. The hub body matches the loading-* reference pattern (heading kept, spinner in the body).

hub-error: sidebar — same "+ New" absence as hub-loading — NOTE. The alert and Retry match the error-* reference pattern (heading kept, message + outline Retry centred, Retry at least 44pt at 390).

## Verdict

No BLOCKING findings. Three NOTEs, none requiring a change in this checkpoint. Gate 2 passes for checkpoint 6.
