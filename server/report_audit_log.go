package books

import "tinycld.org/core/reports"

// auditLogKey names the shipped Audit Log for good.
const auditLogKey = "books.audit_log"

// auditLogShipped is the Audit Log Books ships. Like every Books shipped
// report it is unpublished, and Books shares it with every Books reader
// (report_shares.go), because published reports are hidden from guests.
func auditLogShipped() reports.Shipped {
	return reports.Shipped{
		Key:         auditLogKey,
		Title:       "Audit Log",
		Description: "Every change people made to Books records: when, who and what.",
		Spec:        mustJSON(auditLogSpec()),
		Revision:    1,
		Unpublished: true,
	}
}

// auditLogSpec is one row per audit row of a Books record, newest first (spec
// §5). An unset User, Event or Record type keeps every row.
func auditLogSpec() *reports.Spec {
	return &reports.Spec{
		Version: reports.CurrentVersion,
		Source:  auditLogKey,
		Params:  auditLogParams(),
		Filter: op("and",
			op("between", fld("created"), prm("period")),
			op("in", fld("actor"), prm("users")),
			op("in", fld("event"), prm("events")),
			op("in", fld("record_type"), prm("types")),
		),
		Columns: auditLogColumns(),
		Sort: []reports.SortKey{
			{Formula: fld("created"), Dir: "desc"},
			{Formula: fld("id"), Dir: "desc"},
		},
		// A row opens its record's history; the view puts a line, bundle item
		// or estimate response under its parent, so it opens the parent's.
		Detail: &reports.Detail{
			Label: fld("created"),
			Open:  op("concat", lit("books/history/"), fld("history_type"), lit("/"), fld("history_id")),
		},
		Display: auditLogDisplay(),
	}
}

// auditLogParams are the four chips: Date changed (This month by default),
// User (the people in the log, System included), Event and Record type.
func auditLogParams() []reports.ParamDef {
	return []reports.ParamDef{
		{ID: "period", Type: reports.ParamDateRange, Label: "Date changed", Default: mustJSON(map[string]string{"preset": "thisMonth"})},
		{
			ID: "users", Type: reports.ParamChoice, Label: "User", Multiple: true,
			OptionsFrom: &reports.OptionsFrom{
				Source: auditLogKey,
				Value:  path("actor"),
				Label:  path("actor_name"),
			},
		},
		{ID: "events", Type: reports.ParamChoice, Label: "Event", Multiple: true, Options: auditEvents()},
		{ID: "types", Type: reports.ParamChoice, Label: "Record type", Multiple: true, Options: auditRecordTypeOptions()},
	}
}

// auditLogColumns are Date changed (the label column), User, Event, Record
// type and Record. Event and Record type read selects, so they show labels.
// Event reads event_shown (a credit memo application's Credit applied or
// Credit removed); the Event filter matches event.
func auditLogColumns() []reports.Column {
	return []reports.Column{
		{ID: "created", Label: "Date changed", Formula: fld("created")},
		{ID: "user", Label: "User", Formula: fld("actor_name")},
		{ID: "event", Label: "Event", Formula: fld("event_shown")},
		{ID: "type", Label: "Record type", Formula: fld("record_type")},
		{ID: "record", Label: "Record", Formula: fld("record_label")},
	}
}

// auditLogDisplay is the fixture's AUDIT_LOG_DISPLAY, as measured in phase 3
// pass 2: Date changed and Event never cut, Record takes the spare width and
// wraps to two lines; on a phone two lines (date · event; user · type ·
// record), on a tablet from 600 px the record on a line of its own. User and
// Record type have no least width: with one, the phone's second line fell
// back to core's automatic lines at 390 and 375. Record breaks a long
// unbroken word (OverflowWrap "anywhere"): a wrapping column otherwise never
// goes under its longest word, and one long name moved every row to
// automatic lines. The one line starts at 920 px of row width, not at the 760
// px it needs. Measured row widths: 896 px beside core's 480 px record panel
// at 1440 (it must take the tablet layout there, spec §3 "Phone (390) and the
// panel") and 960 px for the report alone at 1024 with overlay scrollbars; a
// classic scrollbar takes about 15 px from both (881 and 945), so 920 sits
// between them on every scrollbar kind.
func auditLogDisplay() *reports.Display {
	grow := 2
	return &reports.Display{
		OneLine: &reports.DisplayOneLine{MinWidth: "920px"},
		Columns: map[string]reports.ColumnFit{
			"created": {MinWidth: "max-content"},
			"event":   {MinWidth: "max-content"},
			"record":  {FlexGrow: &grow, WhiteSpace: "normal", OverflowWrap: "anywhere", LineClamp: 2, TextOverflow: "ellipsis"},
		},
		Layouts: []reports.DisplayLayout{
			{
				Width:  "mobile",
				Tracks: 7,
				Cells: []reports.DisplayCell{
					{Col: "created", Line: 1, Span: 5},
					{Col: "event", Line: 1, Span: 2, Justify: "end"},
					{Col: "user", Line: 2, Span: 2},
					{Col: "type", Line: 2, Span: 2},
					{Col: "record", Line: 2, Span: 3},
				},
			},
			{
				Width:    "tablet",
				MinWidth: "600px",
				Tracks:   12,
				Cells: []reports.DisplayCell{
					{Col: "created", Line: 1, Span: 4},
					{Col: "user", Line: 1, Span: 3},
					{Col: "event", Line: 1, Span: 2},
					{Col: "type", Line: 1, Span: 3},
					{Col: "record", Line: 2, Span: 12},
				},
			},
		},
	}
}
