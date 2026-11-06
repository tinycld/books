# Gate 2 critique — checkpoint 10 (first attempt, then numbered 8b; critic: fresh subagent, model fable)

Resume (2026-11-05): not re-captured. The resume changes render nothing new (the R key, the web-only Date focus, help text); the shots below were taken in a web browser, where the Date focus rule is unchanged.

Scope: only the first-field focus can show in a screenshot. Core SelectInput trigger and DateField draw no focus-visible ring for script focus, so a "focused" shot and an "unfocused" shot are pixel-identical. The shots therefore cannot prove or disprove the autofocus. Everything else in the Delivers line (keys, shortcut list, help topics, server refusal) does not render.

## State check

- new-1280-light.png: VALID. New transfer form, just opened, empty (both selects "Choose an account", Amount blank, Date 2026-11-05, Memo blank, "—" big figure, Draft badge, help icon). Select menu closed, as §3 Keyboard requires ("without opening its menu"). No focus ring visible on "Transfer from".
- new-1280-dark.png: VALID. Same state, dark. No focus ring visible.
- new-phone-390-light.png: VALID. Same empty new form, phone layout (stacked fields, down arrow between From and To, Cancel / Save draft / Post / More, tab bar). No focus ring visible.
- new-phone-390-dark.png: VALID. Same, dark. No focus ring visible.
- entry-new-1280-light.png: VALID. New journal entry form, just opened, empty (Date 2026-11-05, Journal no. "Assigned when posted", Auto-reverse blank, Memo blank, two empty lines, $0.00, In balance). No focus ring visible on Date; its border matches Auto-reverse on.
- entry-new-1280-dark.png: VALID. Same, dark. No focus ring visible.
- entry-new-phone-390-light.png: VALID. Same empty new form, phone layout. Nothing shows a focus ring (matches the accepted "no autofocus on phone").
- entry-new-phone-390-dark.png: VALID. Same, dark. Nothing shows a focus ring.

## Critique

- new-1280-light / new-1280-dark: nothing found. Structure, hierarchy and field placement match the transfer reference exactly (only the date differs, 11-05 vs 11-04: real data).
- new-phone-390-light / new-phone-390-dark: nothing found. Matches the 390 reference.
- entry-new-1280-light / entry-new-1280-dark: nothing found. Differences from the journal-entries reference (Date and Auto-reverse now draw a calendar icon and a shorter DateField; empty vs populated data; fewer sidebar packages) are component and data changes, not lost decisions.
- entry-new-phone-390-light / entry-new-phone-390-dark: nothing found. Matches the 390 reference's layout.

Observation outside this checkpoint (not a finding): on the transfer form the "Journal Entries" sidebar item is not highlighted, while it is on the journal entry form. Both references show the same, so it is not a regression of 8b.

NOTE (evidence, not design): because no shot can show script focus on these core controls, the gate should take the autofocus evidence from the e2e assertion on the active element (transfer "Transfer from" at 1280 and 390; journal entry Date at 1280; no active form field at 390), not from these images.

Verdict: no BLOCKING findings. All eight screenshots are valid and visually clean.
