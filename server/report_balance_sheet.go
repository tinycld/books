package books

import "tinycld.org/core/reports"

// balanceSheetKey names the shipped Balance Sheet for good.
const balanceSheetKey = "books.balance_sheet"

// placement is where an account type sits in the Balance Sheet outline: its
// class and kind (rank 0 = blank, the level is skipped).
type placement struct {
	ClassRank int
	Class     string
	KindRank  int
	Kind      string
}

// balanceSheetPlacement is the Books-owned class and kind of every asset,
// liability and equity type (spec §5). Fixed, other and long-term types have
// no kind, so their accounts sit directly under the class; equity has
// neither, so its accounts sit directly under the Equity section.
var balanceSheetPlacement = map[string]placement{
	"bank":                    {ClassRank: 1, Class: "Current assets", KindRank: 1, Kind: "Bank accounts"},
	"accounts_receivable":     {ClassRank: 1, Class: "Current assets", KindRank: 2, Kind: "Accounts receivable"},
	"other_current_asset":     {ClassRank: 1, Class: "Current assets", KindRank: 3, Kind: "Other current assets"},
	"fixed_asset":             {ClassRank: 2, Class: "Fixed assets"},
	"other_asset":             {ClassRank: 3, Class: "Other assets"},
	"accounts_payable":        {ClassRank: 4, Class: "Current liabilities", KindRank: 4, Kind: "Accounts payable"},
	"credit_card":             {ClassRank: 4, Class: "Current liabilities", KindRank: 5, Kind: "Credit cards"},
	"other_current_liability": {ClassRank: 4, Class: "Current liabilities", KindRank: 6, Kind: "Other current liabilities"},
	"long_term_liability":     {ClassRank: 5, Class: "Long-term liabilities"},
	"equity":                  {},
}

// balanceSheetShipped is the Balance Sheet Books ships. Like the Trial
// Balance it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func balanceSheetShipped() reports.Shipped {
	return reports.Shipped{
		Key:         balanceSheetKey,
		Title:       "Balance Sheet",
		Description: "What the business owns and owes on one day, beside the same day a year earlier.",
		Spec:        mustJSON(balanceSheetSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// balanceSheetSpec is every balance-sheet account's balance by its normal
// side on the As of day (Current) and on the same day a year earlier (Prior
// year), in the outline section › class › type › account, with Retained
// earnings and Net income computed inside Equity (spec §5). Income, expense
// and retained-earnings lines are read only by those two computed rows, so
// Total Assets equals Total liabilities and equity in both columns. Paths
// start at a journal line.
func balanceSheetSpec() *reports.Spec {
	d := prm("asOf")
	dPrior := op("addMonths", prm("asOf"), lit(-12))
	accountType := fld("account", "type")
	signed := op("if",
		op("in", accountType, lit(creditNormalTypes())),
		op("sub", fld("credit"), fld("debit")),
		op("sub", fld("debit"), fld("credit")),
	)
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  "books.journal_lines",
		Params: []reports.ParamDef{
			{ID: "asOf", Type: reports.ParamAsOf, Label: "As of", Default: mustJSON(map[string]string{"preset": "today"})},
			{
				ID: "rows", Type: reports.ParamChoice, Label: "Rows",
				Options: []reports.Option{
					{Value: "nonzero", Label: "Non-zero"},
					{Value: "active", Label: "Active"},
				},
				Default: mustJSON("nonzero"),
			},
		},
		Filter: op("and",
			op("eq", fld("posted"), lit(true)),
			op("lte", fld("date"), d),
			op("not", op("in", accountType, lit(profitAndLossTypes()))),
			op("ne", fld("account", "detail_type"), lit("retained_earnings")),
		),
		Columns: []reports.Column{
			{ID: "account", Label: "Account", Path: reports.Path{{Link: "account"}}},
			{ID: "current", Label: "Current", Heading: d, Formula: op("coalesce", op("sum", signed), lit(0))},
			{
				ID: "prior", Label: "Prior year", Heading: dPrior,
				Formula: op("coalesce",
					op("sum", op("if", op("lte", fld("date"), dPrior), signed, lit(nil))),
					lit(0),
				),
			},
			{ID: "change", Label: "Change", Detail: reports.DetailBlank, Formula: op("sub", col("current"), col("prior"))},
			{ID: "pct", Label: "% change", Format: "percent", Detail: reports.DetailBlank, Formula: percentChange()},
			{
				ID: "side", Hidden: true,
				Formula: op("case",
					op("in", accountType, lit(typesInGroup("asset"))), lit("asset"),
					op("in", accountType, lit(typesInGroup("liability"))), lit("liability"),
					lit("equity"),
				),
			},
			{ID: "cls", Hidden: true, Formula: placementRankCase(accountType, classOf)},
			{ID: "knd", Hidden: true, Formula: placementRankCase(accountType, kindOf)},
		},
		Groups: []reports.Group{
			{ID: "section", Col: "side", Open: true, Subtotals: true},
			{
				ID: "class", Col: "cls", Label: placementLabelCase(col("cls"), classOf),
				Blank: reports.GroupBlankSkip, HideEmpty: true, Open: true, Subtotals: true,
			},
			{
				ID: "kind", Col: "knd", Label: placementLabelCase(col("knd"), kindOf),
				Blank: reports.GroupBlankSkip, HideEmpty: true, Open: true, Subtotals: true,
			},
			{
				ID: "byAccount", Col: "account", Label: accountLabel(func(n ...string) *reports.Node { return rec("byAccount", n...) }),
				Having: op("or",
					op("eq", prm("rows"), lit("active")),
					op("ne", col("current"), lit(0)),
					op("ne", col("prior"), lit(0)),
				),
			},
		},
		Layout: []reports.LayoutItem{
			{Section: "assets", Title: "Assets", Key: mustJSON("asset")},
			{Section: "liabilities", Title: "Liabilities", Key: mustJSON("liability")},
			{Section: "equity", Title: "Equity", Key: mustJSON("equity")},
			{
				Row: "retainedEarnings", Label: "Retained earnings", Within: "equity",
				Cells: map[string]*reports.Node{"current": retainedEarningsAt(d), "prior": retainedEarningsAt(dPrior)},
			},
			{
				Row: "netIncome", Label: "Net income", Within: "equity",
				Cells: map[string]*reports.Node{"current": netIncomeAt(d), "prior": netIncomeAt(dPrior)},
			},
			{
				Row: "totalLE", Label: "Total liabilities and equity",
				Formula: op("add", &reports.Node{Subtotal: "liabilities"}, &reports.Node{Subtotal: "equity"}),
			},
		},
		Sort: []reports.SortKey{
			{Col: "cls"},
			{Col: "knd"},
			{Formula: rec("byAccount", "number")},
			{Formula: rec("byAccount", "full_name")},
			// Core applies a formula sort key that reads a row's fields to
			// detail rows only, so these two order the opened lines and leave
			// the groups alone. The entry's integer sequence, not its text
			// number, which sorts "10" before "9".
			{Formula: fld("date")},
			{Formula: fld("entry", "sequence")},
		},
		// An opened account line reads "<date> · <entry number> · <memo>",
		// with the entry's memo when the line has none (the Trial Balance's).
		Detail: &reports.Detail{Label: op("concat",
			fld("date"), lit(" · "),
			fld("entry", "number"), lit(" · "),
			op("if", op("isEmpty", fld("memo")), fld("entry", "memo"), fld("memo")),
		)},
		Display: balanceSheetDisplay(),
	}
}

// balanceSheetDisplay keeps every figure whole: the label narrows with an
// ellipsis first, the four figure columns never shrink below their text. It
// has no desktop layout and no one-line gate: core fits one line to the view
// and falls to the tablet layout, then the phone layout, when it does not.
func balanceSheetDisplay() *reports.Display {
	figure := reports.ColumnFit{MinWidth: "max-content"}
	return &reports.Display{
		Columns: map[string]reports.ColumnFit{
			"account": {MinWidth: "12ch"},
			"current": figure,
			"prior":   figure,
			"change":  figure,
			"pct":     figure,
		},
		Layouts: balanceSheetLayouts(),
	}
}

// balanceSheetLayouts are the wrapped rows: the label on its own line, the
// figures on the line below. The phone layout leaves out % change, so a
// phone does not show it.
func balanceSheetLayouts() []reports.DisplayLayout {
	return []reports.DisplayLayout{
		{
			Width:  "mobile",
			Tracks: 3,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1, Span: 3},
				{Col: "current", Line: 2},
				{Col: "prior", Line: 2},
				{Col: "change", Line: 2},
			},
		},
		{
			Width:    "tablet",
			MinWidth: "600px",
			Tracks:   4,
			Cells: []reports.DisplayCell{
				{Col: "account", Line: 1, Span: 4},
				{Col: "current", Line: 2},
				{Col: "prior", Line: 2},
				{Col: "change", Line: 2},
				{Col: "pct", Line: 2},
			},
		},
	}
}

// percentChange divides Change by |Prior year| at scale 4, then multiplies
// by 100; it is empty when Prior year is zero. The engine has no abs operator: |x| is max(x, 0 − x).
func percentChange() *reports.Node {
	scale := 4
	prior := col("prior")
	return op("if",
		op("eq", prior, lit(0)),
		lit(nil),
		op("mul",
			&reports.Node{Op: "div", Args: []*reports.Node{col("change"), op("max", prior, op("sub", lit(0), prior))}, Scale: &scale},
			lit(100),
		),
	)
}

// classOf and kindOf read one level of a placement: its rank and label.
func classOf(p placement) (int, string) { return p.ClassRank, p.Class }

func kindOf(p placement) (int, string) { return p.KindRank, p.Kind }

// placementRankCase is the level's rank of an account type, in
// account_types.json order; no value for a type with no place at that level
// (rank 0), so the group skips the level.
func placementRankCase(accountType *reports.Node, level func(placement) (int, string)) *reports.Node {
	var args []*reports.Node
	for _, t := range accountTypes {
		p, ok := balanceSheetPlacement[t.Key]
		if !ok {
			continue
		}
		rank, _ := level(p)
		var value any
		if rank != 0 {
			value = rank
		}
		args = append(args, op("eq", accountType, lit(t.Key)), lit(value))
	}
	return op("case", append(args, lit(nil))...)
}

// placementLabelCase labels a level's group by its rank, one branch per rank
// in account_types.json order.
func placementLabelCase(rank *reports.Node, level func(placement) (int, string)) *reports.Node {
	var args []*reports.Node
	seen := map[int]bool{}
	for _, t := range accountTypes {
		p, ok := balanceSheetPlacement[t.Key]
		if !ok {
			continue
		}
		r, label := level(p)
		if r == 0 || seen[r] {
			continue
		}
		seen[r] = true
		args = append(args, op("eq", rank, lit(r)), lit(label))
	}
	return op("case", append(args, lit(nil))...)
}

// retainedEarningsAt is Retained earnings on day x (credits − debits): the
// retained-earnings account's posted lines on or before x, plus every income
// and expense line dated before the fiscal year that holds x.
func retainedEarningsAt(x *reports.Node) *reports.Node {
	return profitAndLossSum(x, op("or",
		op("eq", fld("account", "detail_type"), lit("retained_earnings")),
		op("and",
			op("in", fld("account", "type"), lit(profitAndLossTypes())),
			op("lt", op("fiscalYear", fld("date")), op("fiscalYear", x)),
		),
	))
}

// netIncomeAt is Net income on day x (credits − debits, so a profit reads
// positive): the income and expense lines dated in the fiscal year that
// holds x, on or before x.
func netIncomeAt(x *reports.Node) *reports.Node {
	return profitAndLossSum(x, op("and",
		op("in", fld("account", "type"), lit(profitAndLossTypes())),
		op("gte", op("fiscalYear", fld("date")), op("fiscalYear", x)),
	))
}

// profitAndLossSum adds credits − debits of the posted lines on or before x
// that match which; 0 when none does.
func profitAndLossSum(x, which *reports.Node) *reports.Node {
	return op("coalesce", &reports.Node{
		Op:     "lookup",
		Source: "books.journal_lines",
		Where:  op("and", op("eq", fld("posted"), lit(true)), op("lte", fld("date"), x), which),
		Value:  mustJSON(op("sub", fld("credit"), fld("debit"))),
		Pick:   "sum",
	}, lit(0))
}
