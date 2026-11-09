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
		Detail: &reports.Detail{Label: fld("date")},
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
