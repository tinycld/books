package books

import "tinycld.org/core/reports"

// journalKey names the shipped Journal for good.
const journalKey = "books.journal"

// journalShipped is the Journal Books ships: unpublished, and shared with
// every Books reader by the share sync (report_shares.go), as the Trial
// Balance and the General Ledger are.
func journalShipped() reports.Shipped {
	return reports.Shipped{
		Key:         journalKey,
		Title:       "Journal",
		Description: "Every posted entry with its debit and credit lines, for a period.",
		Spec:        mustJSON(journalSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// journalSpec is the Journal (spec §5): one open block per posted entry, its
// lines in form order, a total row per block and a report Total.
//
// A period never splits an entry: posting stamps the entry's date and the
// posted flag on each of its lines (p1-ledger), so a block holds every line
// of its entry, and its total row's Debit equals its Credit.
func journalSpec() *reports.Spec {
	entry := func(n ...string) *reports.Node { return rec("byEntry", n...) }
	heading := entryTypeLabel(entry)
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params: []reports.ParamDef{
			{ID: "period", Label: "Period", Type: reports.ParamDateRange, Default: mustJSON(map[string]string{"preset": "thisMonthToDate"})},
		},
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("between", fld("date"), prm("period")),
		),
		Columns: journalColumns(),
		Groups: []reports.Group{{
			ID:        "byEntry",
			Col:       "entry",
			Open:      true,
			Subtotals: true,
			Label: op("if",
				op("isEmpty", entry("number")),
				heading,
				op("concat", entry("number"), lit(" · "), heading),
			),
		}},
		Sort: []reports.SortKey{
			{Formula: entry("date")},
			{Formula: entry("posted_at")},
			{Formula: entry("sequence")},
			// A key that reads a line orders the lines inside each block and
			// leaves the blocks alone.
			{Formula: fld("position")},
		},
		Detail:  &reports.Detail{Label: fld("date")},
		Display: journalDisplay(),
	}
}

// journalDisplay keeps the figures and an ordinary account name of about 20
// characters whole and gives Description the most of the spare room: core
// shares a line's spare width by each column's flexGrow, so Name needs no fit
// of its own. oneLine.minWidth is 880px (spec §5, measured on the shipping
// route): at a 900px window (836px rows) the columns' mins fit, so core drew
// one line and cut a numbered account of a 20-character name (cut at 856px
// rows, whole at 876px). With the gate, 900 draws the tablet layout and 1024
// and 1280 draw one line.
func journalDisplay() *reports.Display {
	descriptionGrow := 2
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "880px"},
		Columns: map[string]reports.ColumnFit{
			"account":     {MinWidth: "20ch"},
			"description": {FlexGrow: &descriptionGrow},
			"debit":       {MinWidth: "max-content"},
			"credit":      {MinWidth: "max-content"},
		},
		Layouts: journalLayouts(),
	}
}

// journalLayouts are the authored narrow layouts (spec §3 Phone, §5). A phone
// line row wraps onto three lines, its figures on tracks 2 and 3 so Credit
// ends at the right edge; a tablet row keeps its figures on the date's line
// and its text on the line below. No desktop layout: core fits the one line
// to the view, and wraps to the tablet layout when it does not fit.
func journalLayouts() []reports.DisplayLayout {
	return []reports.DisplayLayout{
		{
			Width:  "mobile",
			Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "entry", Line: 1},
				{Col: "account", Line: 1, Span: 2},
				{Col: "name", Line: 2},
				{Col: "description", Line: 2, Span: 2},
				{Col: "debit", Line: 3, Start: 2},
				{Col: "credit", Line: 3, Start: 3},
			},
		},
		{
			Width:    "tablet",
			MinWidth: "600px",
			Tracks:   12,
			Cells: []reports.DisplayCell{
				{Col: "entry", Line: 1, Span: 2},
				{Col: "account", Line: 1, Span: 4},
				{Col: "debit", Line: 1, Span: 3},
				{Col: "credit", Line: 1, Span: 3},
				{Col: "name", Line: 2, Span: 4},
				{Col: "description", Line: 2, Span: 8},
			},
		},
	}
}

// journalColumns are the Journal's columns. The label column shows the
// entry on block rows and the line's date on line rows.
func journalColumns() []reports.Column {
	return []reports.Column{
		{ID: "entry", Label: "Entry / Date", Path: reports.Path{{Link: "entry"}}},
		{ID: "account", Label: "Account", Formula: accountLabel(func(n ...string) *reports.Node { return fld(append([]string{"account"}, n...)...) })},
		{ID: "name", Label: "Name", Formula: op("coalesce", fld("customer", "display_name"), fld("vendor", "display_name"))},
		{ID: "description", Label: "Description", Formula: op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo"))},
		// A zero side is blank on a line; block and total rows add the side.
		{ID: "debit", Label: "Debit", Formula: blankZero(fld("debit")), Rollup: op("sum", fld("debit"))},
		{ID: "credit", Label: "Credit", Formula: blankZero(fld("credit")), Rollup: op("sum", fld("credit"))},
	}
}
