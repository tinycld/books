# Gate 2 critique after the fix round — vendor-refund, checkpoint 4

Scope: the cannot-edit notice only. Built shots in this directory; reference `../../vendor-refund-reference/cannot-edit-{390,1280}-light.png`. The new state `cannot-edit-draft` has no reference; it is judged against spec §3.6, §3.8 and the look of the reference notice.

## cannot-edit-draft-390-light.png
State check: VALID. It shows the notice "This vendor refund cannot be edited" with a "Delete draft" button (a stored correction draft whose original is void, reached by search, per capture.json).

- cannot-edit-draft-390-light: button under the notice — "Delete draft" is a neutral outline button, the only action on the screen, with no danger tone. A destructive action that looks the same as a neutral one. — NOTE
- cannot-edit-draft-390-light: notice text — the text does not say why the draft cannot be edited (its original is no longer posted) or why Delete draft is the only path. Spec §3.8 gives only this text, so no rule is broken. — NOTE

## cannot-edit-draft-1280-light.png
State check: VALID. Same state at 1280: notice and "Delete draft" button, centered in the content pane.

- cannot-edit-draft-1280-light: button under the notice — same neutral tone on a destructive action as at 390. — NOTE
- The notice keeps the reference's structure: back link "Journal entries" at the top left, the strong centered line at the same position and size. The button is centered under the line with an even gap at both widths. No text wraps or truncates.

Spec placement: §3.6 puts Delete draft in "More (Delete draft, on saved drafts)" of the form's action bar. This state has no form and no action bar, so a direct button is an acceptable place; not a finding.

## cannot-edit-390-light.png
State check: VALID. It shows the `?replaces` notice of a void refund: the line "This vendor refund cannot be edited" only.

Nothing found. It is the same as the reference in kind and in layout; no Delete draft.

## cannot-edit-1280-light.png
State check: VALID. Same state at 1280.

Nothing found. It is the same as the reference; no Delete draft.

## Not judged
- Dark scheme: the manifest captures both shots in light only, as the reference does (`cannot-edit` is a light-only reference shot).

## For gate 3
- None visible. The shots do not show that "Delete draft" opens the dialog "Delete this draft vendor refund? This can't be undone." (spec §3.6); that needs a test, not a screenshot.

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
