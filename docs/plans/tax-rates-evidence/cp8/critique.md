# Checkpoint 8 critique — Product and customer tax fields

Delivers: the Taxable toggle on products and the exemption and default sales tax fields on customers, with their defaults, rules and pickers, the in-app help topic, and the help link on the Sales tax page.

Decided differences (not findings): the reference draws the fields outside the forms renderer (cell chrome differs); the built customer shots are 1600 px tall. Known core limit: `FieldCell` draws a toggle's description above the label.

## State check

| Shot | State named | Shows it? |
|---|---|---|
| product-1280-light | new non-inventory item, Taxable on by default | Yes |
| product-1280-dark | same | Yes |
| customer-exempt-1280-light | new customer, exempt on, reason Resale, certificate number filled, default tax hidden | Yes |
| customer-exempt-1280-dark | same | Yes |
| customer-exempt-390-light | same at phone width | Yes |
| customer-exempt-390-dark | same | Yes |
| customer-not-exempt-1280-light | new customer, exempt off, exemption fields hidden, default tax "Adams County combined 3.65%" | Yes |
| customer-not-exempt-1280-dark | same | Yes |

INVALID: 0.

## Findings

### product-1280-light
- product-1280-light: Taxable row — the help text "Charge sales tax on this item when it is sold." sits above the "Taxable" label; the reference puts it below the label. Known core `FieldCell` limit, already recorded for the human. Not counted. The toggle is on by default for a non-inventory item and sits after Income account, as the spec says ("after Income account … A new Non-inventory item starts taxable").
- nothing found.

### product-1280-dark
- Same core help-text placement as the light shot (not counted). Labels, help text and both toggle states are legible.
- nothing found.

### customer-exempt-1280-light
- Fields sit before Notes; reason and certificate number are half width side by side; Default sales tax is hidden while exempt (`hide_default_tax`). Spacing between the Same-as-billing toggle, the exempt toggle and the reason row matches the rest of the form.
- nothing found.

### customer-exempt-1280-dark
- nothing found.

### customer-exempt-390-light
- Exemption reason and certificate number stack full width at 390, where the reference drew them side by side. The form stacks every half-width pair at this width (Email/Phone, Mobile/Website do the same), and the reference's side-by-side version wrapped its label and clipped the input. Not a finding.
- nothing found.

### customer-exempt-390-dark
- nothing found.

### customer-not-exempt-1280-light
- Exempt off hides reason and certificate number (`hide_exemption`); Default sales tax shows the chosen rate with its percent. Order and position match the spec and the reference.
- nothing found.

### customer-not-exempt-1280-dark
- The off toggle track is dim but visible, the same as the Same-as-billing toggle and the reference.
- nothing found.

## Coverage

No screenshot shows the help link on the Sales tax page (`HelpIcon topic="books:sales-tax"`) or the help topic itself, although the Delivers line names both. This critique does not cover them.

## Totals

INVALID 0 · BLOCKING 0 · NOTE 0
