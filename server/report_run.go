package books

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// reportRowsCap is the most rows reportRowsFor reads in its one page.
const reportRowsCap = maxPDFLines + 100

// reportRowsFor runs a Books report spec as auth, under auth's rules, with
// every group open and every row in one page of reportRowsCap rows: a
// document printed from a report (a customer statement) needs all its rows.
// today is the day the run's presets read. Like core's readWholeReport it
// reads no second page: a run with more rows than the page holds (a next
// page) or one a cap stopped (a rowCap or nestCap notice) is an error, so a
// document is never printed from part of its rows.
func reportRowsFor(ctx context.Context, app core.App, auth *core.Record, spec *reports.Spec, params map[string]json.RawMessage, today string) (*reports.Result, error) {
	loaded, info, err := reports.Load(mustJSON(spec))
	if err != nil {
		return nil, err
	}
	res, err := reports.Run(ctx, app, reports.Request{
		Spec: loaded, Loaded: info, Params: params,
		Options: reports.Options{ExpandAll: true, Today: today, Limit: reportRowsCap},
		Auth:    auth,
		Headers: map[string]string{},
		PageCap: reportRowsCap,
	})
	if err != nil {
		return nil, err
	}
	if res.Page != nil && res.Page.Next != "" {
		return nil, fmt.Errorf("books: report: more than %d rows", reportRowsCap)
	}
	for _, n := range res.Notices {
		if n.Code == "rowCap" || n.Code == "nestCap" {
			return nil, fmt.Errorf("books: report: the run stopped at a cap: %s", n.Message)
		}
	}
	return res, nil
}
