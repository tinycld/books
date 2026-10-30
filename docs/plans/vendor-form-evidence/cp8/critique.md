# Gate 2 critique — checkpoint 8 "Vendor page, form and save"

Judged against the Delivers line of checkpoint 8 (`vendors/<id>` and `vendors/new` on the page and panel surfaces through `RecordChild`, the `books:vendor` host and its default layout, the Payment terms / Account number / Default expense account components, the not-found state, the New menu entry). Parts of later checkpoints are not findings: the panel row highlight and second tap (checkpoint 9), the row menu beside the panel and the empty ⋮ cell (checkpoint 10), inactive and delete (checkpoint 10).

Not a finding (known core gap): `bg-danger-soft` / `border-danger-soft-foreground` undefined in core's global.css.

## State check

| Shot | Named state | Shows | Verdict |
|---|---|---|---|
| page-1100-light / -dark | edit page, populated (Office Supply World) | "‹ Vendors", "Edit vendor", every field filled, Cancel + Save | valid |
| new-1100-light / -dark | create page, empty | "New vendor", empty fields, Payment terms and Default expense account "None", Cancel + Save and new + Save | valid |
| not-found-1100-light / -dark | unknown id | "Vendor" title, "This vendor doesn't exist or was removed", "Back to vendors" | valid |
| phone-page-390-light / -dark | edit page at 390, populated | one column, "Edit vendor", filled, Cancel + Save over the tab bar | valid |
| panel-1600-light / -dark | 480 px panel beside the list, populated | panel with ✕, "Edit vendor", filled, Cancel + Save; list filtered to the one row by the capture's search | valid |
| panel-long-1600-light / -dark | panel, long-value vendor (Willamette Valley …) | panel with the long display name, company, email, website and address | valid |

No INVALID shot. The read-only state has no built shot; see "Read-only" below.

## Findings

### page-1100-light, page-1100-dark

- page-1100: Default expense account trigger — the selected value `6210 Design Tools` starts 8 px right of the field's inset (x 398 against x 390 for `Net 15`, `1234567` and every other value in the column); the two leading spaces of the depth-indented option label are visible in the trigger. The inset also changes with the account chosen: a depth-1 account (`6200 Software Subscriptions` on panel-long) is flush, a depth-2 account is indented, a depth-3 account would be indented twice. — BLOCKING (reference decision: in reference `page-1100-light` the trigger value `6400 Office and general` starts at the same inset as `Net 15` and every input value above it; the spec's indentation is for the option list, "then the active accounts of the chart in chart order, indented by depth, labelled `number name`", and the trigger is specified as showing the account's name, "shows that account's name in the trigger"). Visible: yes, at every width (page 8 px, panel 8 px, phone 8 px). Precedent: `accountOptionList` feeds the journal-entry line select the same labels, so that select carries the same offset; this is where the shared label meets a single-value trigger for the first time on a form of aligned values.
- page-1100: Account number hint — "Your account number with this vendor." sits 6 px closer to its input than in the reference (hint baseline y 956 against 962; the fields below shift up by 6). — NOTE (no rule; the built spacing is core `TextInput`'s own `hint` spacing and reads fine).

### new-1100-light, new-1100-dark

- new-1100: Account number hint — the same 6 px tighter hint as page-1100. — NOTE.
- Otherwise nothing found: title, empty fields, the two "None" selects and the three-button footer match the reference.

### not-found-1100-light, not-found-1100-dark

- nothing found (pixel-identical to the reference in both themes).

### phone-page-390-light, phone-page-390-dark

- phone-page-390: Default expense account trigger — the same leading-space offset (x 46 against x 38). — BLOCKING (same basis as page-1100; one finding, counted once).
- phone-page-390: Account number hint — the same 6 px tighter hint. — NOTE.
- phone-page-390-dark: a faint ghost of "Cancel" (y ≈ 65) and of two tab-bar icons (y ≈ 120) at the top right. The reference dark shot has the same ghost, so it is the full-page capture repainting the sticky footer and tab bar, not the build. Not a finding; worth a look at the capture tool.

### panel-1600-light, panel-1600-dark

- panel-1600: Default expense account trigger — the same leading-space offset (x 1160 against x 1152). — BLOCKING (same basis; counted once).
- panel-1600: Account number hint — the same 6 px tighter hint. — NOTE.
- The list beside the panel shows one row (the capture searches before pressing the row), so it does not show the full list the reference shows; the panel itself, its header, ✕, form, and footer match the reference. The open row's `bg-accent` already matches the reference (checkpoint 9 proves it). The empty ⋮ cell is checkpoint 10.

### panel-long-1600-light, panel-long-1600-dark

- nothing found. The depth-1 account `6200 Software Subscriptions` is flush with the inset, which shows the offset above is depth-dependent. Display name, Company name, Email, Website and Street clip at the input's right edge with no ellipsis, as in the reference (text inputs scroll); the Notes wrap on three lines, as in the reference.

## Read-only (no built shot)

Read against reference `read-only-1100-*` and `read-only-1600-*`, which show the title "Vendor" (page: "‹ Vendors" above it; panel: ✕ beside it) and a footer with only Close.

- `lib/record-display.ts` `recordTitle('vendor', { mode: 'edit', canWrite: false })` returns `Vendor`; `{ mode: 'new', canWrite: false }` also returns `Vendor`. Matches the reference title.
- `recordFooter({ mode, canWrite: false })` returns `{ cancel: false, save: false, saveAndNew: false, close: true }`; `RecordChild.tsx` `RecordFooter` renders `CloseButton` on `shown.close` and hides Cancel, Save and new and Save. Matches the reference footer.
- `useVendorForm.ts` passes `base.canWrite` to `recordTitle`, and `RecordChild` passes `state.readOnly` to the renderer and excludes read-only dirty tracking (`hasDirtyFields`). Nothing found.

## Implementer note (judged)

The two leading spaces in the trigger are visible (8 px at every width) and vary with the chosen account's depth, so the field's value does not sit at the form's shared inset the way the reference and every other field do. That loses the reference's alignment decision; see the BLOCKING finding under page-1100. A fix that keeps the option list indented and the trigger flush (a trimmed trigger label, or a depth-aware option renderer instead of spaces in the label) is the implementer's call.

## Totals

- INVALID: 0
- BLOCKING: 1 (the expense account trigger's leading-space offset; seen on page-1100, phone-page-390 and panel-1600)
- NOTE: 1 distinct (the 6 px tighter Account number hint; seen on page-1100, new-1100, phone-page-390 and panel-1600), plus the capture ghost on phone-page-390-dark recorded as not a finding
