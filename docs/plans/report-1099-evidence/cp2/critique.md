# Design critique: report-1099, checkpoint 2 (Report spec, figures and choices)

Scope: the Delivers line of checkpoint 2. Opened boxes and payment rows (checkpoint 3) and the phone rows and entry points (checkpoint 5) are not judged. Each built shot was read in light and dark, with its reference pair.

Result: 0 INVALID, 0 BLOCKING, 7 NOTE.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| populated-1280 | valid | valid | Default run, 2 vendors, boxes closed, Total row |
| populated-1024 | valid | valid | Same run, one-line rows |
| populated-768 | valid | valid | Same run, `mobile` arrangement (label line, then 3 figures) |
| below-1280 | valid | valid | Show = Below the threshold |
| tracked-1280 | valid | valid | Show = All 1099 vendors, 4 vendors |
| untracked-1280 | valid | valid | Show = Not tracked for 1099 (list cut by the shot height) |
| nec-1280 | valid | valid | Form = 1099-NEC, heading "Form: 1099-NEC" |
| by-amount-1280 | valid | valid | Order = Largest reportable (chip); row order equals the Name order with this data |
| filtered-1280 | valid | valid | Show = All 1099 vendors, Vendor = 2 picks, heading "Vendor: …" |
| empty-1024 | valid | valid | Custom period January 2020, empty text, "Show this calendar year" |
| loading-1024 | valid | valid | Core loading state (spinner) |
| error-1024 | valid | valid | Core error state with Retry |

## Findings

### populated-1280 (light, dark)
Nothing found. Structure agrees with the reference: heading with the four lines, vendor rows open, box rows closed, muted inactive vendor, blank Excluded cells, heavy Total row with currency.

### populated-1024 (light, dark)
Nothing found.

### populated-768 (light, dark)
- populated-768: toolbar, page title — the title is cut to "1099 Summ…" because five buttons are on the same line (the reference keeps "1099 Summary and D…" with four buttons). The document heading below gives the full title. — NOTE
- populated-768: param chip row, right edge — the Order chip is cut ("Orde") and Add filter is not in view; the chip row continues off the right edge. The reference does the same. — NOTE

The `mobile` arrangement agrees with the reference: VENDOR heading on line 1, the three figure headings on line 2, figures right-aligned in three equal tracks, no figure cut.

### below-1280 (light, dark)
Nothing found. The reference shows an opened box with payment rows; that is checkpoint 3.

### tracked-1280 (light, dark)
Nothing found. The long vendor label wraps to two lines with the figures centered on it, as in the reference.

### untracked-1280 (light, dark)
- untracked-1280: bottom of the list — the shot height (800) cuts the list at "Metro Commercial Properties"; the Total row and the end of the report are not in the evidence (the reference shows them). A height of about 1260 shows the full list. — NOTE

### nec-1280 (light, dark)
Nothing found.

### by-amount-1280 (light, dark)
- by-amount-1280: vendor rows — with the default Show the book has two vendors, and their order by Reportable equals their order by name, so the shot is the same as populated-1280 except for the chip. The reference shows a changed order. A capture with Show = All 1099 vendors shows the change (Greenline moves below Old Town). — NOTE

### filtered-1280 (light, dark)
- filtered-1280: Vendor chip against the heading line — the chip reads "Vendor: Jamal Okafor, Greenline Landscaping" (pick order) and the heading reads "Vendor: Greenline Landscaping, Jamal Okafor" (name order). The reference shows one order in both places. — NOTE

### empty-1024 (light, dark)
Nothing found. Collapse all is not drawn, as in the reference. The action reads "Show this calendar year" (plan decision D3); the reference label "Show this fiscal year" is older than D3.

### loading-1024 (light, dark)
- loading-1024: below the chip row — the built state has no "This report does not update by itself…" line and no Refresh button; the reference shows them during loading. This is core's state, which this unit does not change. I did not find the Expenses by Vendor evidence to compare with (four guessed paths under `docs/plans/expenses-by-vendor-evidence/` do not exist). — NOTE

### error-1024 (light, dark)
- error-1024: below the chip row — same difference as loading-1024: no manual-refresh line and no Refresh button; the reference shows them. Core's state. — NOTE

## For gate 3

- Heading, first line: the built report prints "Test Organization". Spec §3 Heading: "The Books business name". Make sure this is the business name of the seeded e2e book and not the organization name used as a fallback.
- untracked-1280: "Ironclad Equipment Rentals" shows a vendor row and a "Not reported" row with Reportable 0.00, Excluded blank and All payments 0.00. Its payment rows add up to zero. Make sure that a vendor whose rows net to zero is meant to show.
- by-amount-1280: the evidence does not prove the order (see the NOTE).
