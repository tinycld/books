# Checkpoint 9 — gate 2 design critique

Judged: the Delivers line (the type chooser on `products/new`, the product form on the page and panel surface through `RecordChild` with title by type, the per-type definition, the Cancel / Save / Save and new footer, the not-found state, the New menu entry) and the layout points cp6 left to this checkpoint (the 560 px sideways scroll and Name's ellipsis in the panel-1600 list column). Not counted: the empty row menu cell (checkpoint 11), the panel's open-row mark (checkpoint 11's test 8).

Method: every built PNG viewed in light and dark; each pair pixel-diffed against its reference (Pillow `ImageChops.difference`). `chooser-read-only-1100-*` and `read-only-1600-*` were read against the code (`chosenProductType`, `recordTitle`, `recordFooter`, `ProductTypeChooser`, `RecordChild`).

## State check

| Shot | Shows the named state? |
|---|---|
| chooser-1600-light / dark | Yes. 1600 px, list behind, 480 px panel "New product or service" with the three rows and a Cancel-only footer. |
| chooser-390-light / dark | Yes. Phone page: "‹ Products and services", title, three rows, Cancel footer above the tab bar. |
| service-new-1100-light / dark | Yes. Page "New service", Type = Service, Income account = 4000 Consulting Income, Cancel / Save and new / Save. |
| service-edit-1100-light / dark | Yes. Page "Edit service" for the seeded Year-end tax preparation, Cancel / Save. |
| panel-1600-light / dark | Yes. 1600 px, list in the left column, panel "Edit non-inventory item" for Design software license (annual), purchasing on, Cancel / Save. |
| not-found-1100-light / dark | Yes. Page "Product or service" with the not-found message and the back button. |

No shot is INVALID.

## Pixel diff against the references

| Pair | Differing pixels | Where |
|---|---|---|
| chooser-1600 light / dark | 462 / 462 | x 1088–1092 only: the row menu kebab the reference draws and the build leaves empty (checkpoint 11). |
| chooser-390 light / dark | 0 / 0 | identical |
| service-new-1100 light / dark | 0 / 0 | identical |
| service-edit-1100 light / dark | 0 / 0 | identical |
| panel-1600 light / dark | 840 / 840 | x 1088–1092 only: the row menu kebab (checkpoint 11). |
| not-found-1100 light / dark | 0 / 0 | identical |

Outside the known menu cell the build reproduces every reference exactly, in both themes.

## Findings per screenshot

**chooser-1600-light:** nothing found. Panel header 52 px with title and ✕; three rows with name (semibold foreground), one muted sentence, chevron, `border-border` separators; footer Cancel only (spec: "The footer has Cancel only."). Sentences match the spec text word for word.

**chooser-1600-dark:** nothing found. Separators, muted sentences and chevrons stay legible on the dark panel.

**chooser-390-light:** nothing found. Back link, title, rows wrapping to two lines at 390 px with the chevron vertically centred; row height ≥ 64 px (spec "min height 64 px"); Cancel footer sits above the tab bar.

**chooser-390-dark:** nothing found.

**service-new-1100-light:** nothing found. Title "New service" (`recordTitle('service', new, writer)`); centred column ≤ 720 px; half-width pairs Name + SKU and Sales price + Income account side by side (spec Q18 at ≥ 640 px); Sales description and the purchase toggle full width; Purchase description / Cost / Expense account hidden while the toggle is off (default rule); Income account carries the display-only required mark; footer Cancel, Save and new (outline), Save (default) in that order.

**service-new-1100-dark:** nothing found. Input borders and the off toggle read on the dark surface.

**service-edit-1100-light:** nothing found. Title "Edit service"; values filled; Sales price "1,250.00" right-aligned in its input (spec: MoneyField "right-aligned"); footer Cancel and Save, no Save and new (spec: "Save and new (create only)").

**service-edit-1100-dark:** nothing found.

**panel-1600-light:** nothing found on the form. Panel title "Edit non-inventory item"; one column in the 480 px panel (spec Q18: "the 480 px panel and phones show one column"); purchasing on reveals Purchase description, Cost ("360.00" right-aligned) and Expense account "6210 Design Tools"; footer Cancel and Save. List column (the point cp6 deferred): the column is 324→1120 = 796 px, wider than the 560 px table minimum, so the table lays out without a sideways scroll and no scrollbar appears — correct at this width. Name's ellipsis: "Business laptop, 14-inch, 32 GB memory, 1 TB storage, …" and "On-site network troubleshooting, two-hour minimum wi…" truncate on one line with an ellipsis before the Type column, the SKU line below stays intact, and no name collapses to blank (spec: "Name shrinks with an ellipsis and never collapses to blank"). `ProductRow.tsx` sets `numberOfLines={1}` on the name and `ProductsList.tsx` passes `minWidth={PRODUCT_TABLE_MIN_WIDTH}`; the 560 px sideways scroll itself is still not observable in any capture (at 1360 px the list column is 1360 − 324 − 480 = 556 px, the one width that would show it). It stays unjudged by capture; checkpoint 11's wide list capture (test 8) should include a 1360 px shot or the critique must read it from the code again — NOTE.

**panel-1600-dark:** nothing found. The open row's `bg-accent` mark and the panel's input borders remain visible in dark mode.

**not-found-1100-light:** nothing found. Header title "Product or service" with the "‹ Products and services" back link; message "This product or service doesn't exist or was removed" centred with the outline button "Back to products and services" (spec text, exact); no footer, as in the reference.

**not-found-1100-dark:** nothing found.

## Read-only states (code read; no capture possible)

**chooser-read-only-1100-\*:** `chosenProductType(param, false)` returns `null` for every `?type=`, so a reader gets `ProductTypeChooser canWrite={false}`: `ReadOnlyLine` renders "You can view products but not add them." (`CHOOSER_READ_ONLY`, `pb-2 text-sm text-muted-foreground`) above the rows, each row `disabled` with `opacity-60`, footer Cancel. This is the reference's structure (line above the rows, dimmed rows, Cancel footer). Nothing found.

**read-only-1600-\*:** `productTitle('non_inventory', { mode: 'edit', canWrite: false })` → `recordTitle` capitalises the noun → "Non-inventory item", the reference's title. `recordFooter({ canWrite: false })` → `{ cancel: false, save: false, saveAndNew: false, close: true }`, so `RecordFooter` renders only the outline "Close" button (`product-close-footer`), and `RecordFormBody` passes `readOnly={state.readOnly}` to `FormRenderer`, which is the reference's dimmed, non-editable fields. Nothing found.

## Summary

- BLOCKING: none.
- NOTE (1): the 560 px sideways scroll is not observable at 1600 px (the list column is 796 px); capture or re-read it at 1360 px in checkpoint 11.

Every built shot shows its named state, every pair is pixel-identical to its reference outside the checkpoint-11 row menu cell, and the two read-only references are reproduced by the code paths. Gate 2 passes for checkpoint 9.
