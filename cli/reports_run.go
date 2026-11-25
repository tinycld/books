package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// maxReportPages stops `--all` when the server keeps giving a next page. At
// the server's largest page it is far more rows than a report holds.
const maxReportPages = 10000

// reportResult is what `reports run` prints with --json: the server's result,
// with the cursor of the next page as `next`. The columns, rows, notices and
// params are the server's own JSON, so nothing of a row is lost.
type reportResult struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Heading     string            `json:"heading"`
	HeaderLines []string          `json:"headerLines"`
	Params      json.RawMessage   `json:"params"`
	Columns     []json.RawMessage `json:"columns"`
	Rows        []json.RawMessage `json:"rows"`
	Notices     []json.RawMessage `json:"notices"`
	// Next is the cursor of the next page; "" on the last page.
	Next string `json:"next"`
}

// reportPage is the server's answer to one run.
type reportPage struct {
	Heading     string            `json:"heading"`
	HeaderLines []string          `json:"headerLines"`
	Params      json.RawMessage   `json:"params"`
	Columns     []json.RawMessage `json:"columns"`
	Rows        []json.RawMessage `json:"rows"`
	Notices     []json.RawMessage `json:"notices"`
	Page        *struct {
		Next string `json:"next"`
	} `json:"page"`
}

// reportRequest is one run: the report, and the params and options of the
// --input document as the caller wrote them. The server checks both.
type reportRequest struct {
	id      string
	title   string
	params  any
	options map[string]any
}

func (r reportRequest) body(cursor string) map[string]any {
	body := map[string]any{"reportId": r.id}
	if r.params != nil {
		body["params"] = r.params
	}
	options := maps.Clone(r.options)
	if cursor != "" {
		if options == nil {
			options = map[string]any{}
		}
		options["cursor"] = cursor
	}
	if len(options) > 0 {
		body["options"] = options
	}
	return body
}

// runReportPage runs one page of a report, from cursor ("" for the first).
func runReportPage(ctx context.Context, c *client.Client, req reportRequest, cursor string) (reportResult, error) {
	var page reportPage
	if err := c.PostJSON(ctx, reportRunPath, req.body(cursor), &page); err != nil {
		return reportResult{}, err
	}
	res := reportResult{
		ID: req.id, Title: req.title, Heading: page.Heading, HeaderLines: page.HeaderLines,
		Params: page.Params, Columns: page.Columns, Rows: page.Rows, Notices: page.Notices,
	}
	if page.Page != nil {
		res.Next = page.Page.Next
	}
	if res.HeaderLines == nil {
		res.HeaderLines = []string{}
	}
	if res.Params == nil {
		res.Params = json.RawMessage("[]")
	}
	if res.Columns == nil {
		res.Columns = []json.RawMessage{}
	}
	if res.Rows == nil {
		res.Rows = []json.RawMessage{}
	}
	if res.Notices == nil {
		res.Notices = []json.RawMessage{}
	}
	return res, nil
}

// pageRow is what the merge of pages reads of a row.
type pageRow struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Section string `json:"section"`
}

// wholeReportRow says a row stands for the whole report: a total, or a
// computed row outside a section. The server puts those after every page.
func (r pageRow) wholeReportRow() bool {
	return r.Kind == "total" || (r.Kind == "computed" && r.Section == "")
}

// reportPages joins the pages of one run, as the app does (core
// reports/lib/rows.ts mergePages): the whole-report rows at the end of every
// page but the last go, a row whose id an earlier page gave is kept one time,
// and a notice of one code is kept one time. The rest is the last page's.
type reportPages struct {
	rows    []json.RawMessage
	seen    map[string]bool
	notices []json.RawMessage
	codes   map[string]bool
}

func (p *reportPages) add(page reportResult, last bool) error {
	if p.seen == nil {
		p.seen, p.codes = map[string]bool{}, map[string]bool{}
	}
	rows := make([]pageRow, len(page.Rows))
	for i, raw := range page.Rows {
		if err := json.Unmarshal(raw, &rows[i]); err != nil {
			return fmt.Errorf("the server's row %d is not a row: %w", i, err)
		}
	}
	end := len(rows)
	for !last && end > 0 && rows[end-1].wholeReportRow() {
		end--
	}
	for i, row := range rows[:end] {
		if p.seen[row.ID] {
			continue
		}
		p.seen[row.ID] = true
		p.rows = append(p.rows, page.Rows[i])
	}
	for _, raw := range page.Notices {
		var notice struct {
			Code string `json:"code"`
		}
		if err := json.Unmarshal(raw, &notice); err != nil {
			return fmt.Errorf("the server's notice is not a notice: %w", err)
		}
		if !p.codes[notice.Code] {
			p.codes[notice.Code] = true
			p.notices = append(p.notices, raw)
		}
	}
	return nil
}

// runWholeReport runs every page of a report, from cursor, and gives the rows
// of all of them in one result with no next page.
func runWholeReport(ctx context.Context, c *client.Client, req reportRequest, cursor string) (reportResult, error) {
	var pages reportPages
	for n := 1; ; n++ {
		page, err := runReportPage(ctx, c, req, cursor)
		if err != nil {
			return reportResult{}, err
		}
		if err := pages.add(page, page.Next == ""); err != nil {
			return reportResult{}, err
		}
		if page.Next == "" {
			page.Rows, page.Notices = pages.rows, pages.notices
			if page.Notices == nil {
				page.Notices = []json.RawMessage{}
			}
			if page.Rows == nil {
				page.Rows = []json.RawMessage{}
			}
			return page, nil
		}
		if n >= maxReportPages {
			return reportResult{}, fmt.Errorf("the report did not end after %d pages", maxReportPages)
		}
		if page.Next == cursor {
			return reportResult{}, fmt.Errorf("the server gave the same next page twice (cursor %q)", cursor)
		}
		cursor = page.Next
	}
}

// reportInput reads the params and options of the --input document. With no
// --input the report runs with its defaults.
func reportInput(cmd *cobra.Command, path string) (params any, options map[string]any, err error) {
	if path == "" {
		return nil, nil, nil
	}
	in, err := readInput(cmd, path)
	if err != nil {
		return nil, nil, err
	}
	for _, key := range slices.Sorted(maps.Keys(in)) {
		if key != "params" && key != "options" {
			return nil, nil, usagef("--input: unknown key %q; the keys are \"params\" and \"options\"", key)
		}
		if _, ok := in[key].(map[string]any); !ok {
			return nil, nil, usagef("--input: %q must be an object", key)
		}
	}
	if raw, has := in["params"]; has {
		params = raw
	}
	options, _ = in["options"].(map[string]any)
	return params, options, nil
}

var reportInputSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"properties": map[string]any{
		"params": map[string]any{
			"type":        "object",
			"description": "a value for each param to set, by the param's id (`reports show` lists them). A param left out takes its default. The server refuses an unknown id or a wrong value.",
		},
		"options": map[string]any{
			"type": "object",
			"description": "how to run: \"today\" (YYYY-MM-DD, the day the period presets count from; default today in UTC), \"timeZone\" (an IANA zone), " +
				"\"expandAll\" (true opens every group), \"expand\" and \"collapse\" (lists of group keys), \"sort\" (a list of {\"col\", \"desc\"}), \"limit\" and \"cursor\" (the page). " +
				"For `export` only: \"display\" (the display options of the view, as the app sends them). " +
				"The --limit, --cursor and --expand-all flags set the same options.",
		},
	},
}

var reportResultSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"id":          map[string]any{"type": "string", "description": "the id of the report"},
		"title":       map[string]any{"type": "string"},
		"heading":     map[string]any{"type": "string", "description": "the name printed above the title; \"\" for the organization's name"},
		"headerLines": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "the lines under the period"},
		"params":      map[string]any{"type": "array", "items": map[string]any{"type": "object"}, "description": "the params as the run resolved them: id, type, and value, list, or from and to"},
		"columns":     map[string]any{"type": "array", "items": map[string]any{"type": "object"}, "description": "the columns in order: id, label, type (and currency for an amount)"},
		"rows": map[string]any{"type": "array", "items": map[string]any{"type": "object"},
			"description": "the rows in order: id, kind (detail, group, opening, subtotal, computed or total), depth, label, and cells by column id. An amount is integer cents."},
		"notices": map[string]any{"type": "array", "items": map[string]any{"type": "object"}, "description": "what the reader must know about the result: code and message"},
		"next":    map[string]any{"type": "string", "description": "the cursor of the next page, for --cursor; \"\" when this is the last page"},
	},
	"required": []string{"id", "title", "heading", "headerLines", "params", "columns", "rows", "notices", "next"},
}

type reportRunFlags struct {
	input     string
	limit     int
	cursor    string
	all       bool
	expandAll bool
}

// request builds the run from the report, the --input document and the flags.
// A flag wins over the same option of the document.
func (fl reportRunFlags) request(cmd *cobra.Command, raw rawRecord) (reportRequest, error) {
	if fl.limit < 0 {
		return reportRequest{}, usagef("--limit must be 1 or more")
	}
	if fl.all && fl.cursor != "" {
		return reportRequest{}, usagef("--all and --cursor cannot be used together")
	}
	params, options, err := reportInput(cmd, fl.input)
	if err != nil {
		return reportRequest{}, err
	}
	if options == nil {
		options = map[string]any{}
	}
	if _, has := options["cursor"]; has {
		return reportRequest{}, usagef("--input: give the cursor with --cursor, not in \"options\"")
	}
	if fl.limit > 0 {
		options["limit"] = fl.limit
	}
	if fl.expandAll {
		options["expandAll"] = true
	}
	id, _ := raw["id"].(string)
	title, _ := raw["title"].(string)
	return reportRequest{id: id, title: title, params: params, options: options}, nil
}

func newReportRunCmd(c *client.Client) *cobra.Command {
	var fl reportRunFlags
	cmd := newCommand(commandDef{
		Name:  "run",
		Short: "Run a report and print its rows",
		Long: "Run a report and print its rows.\n\n" +
			"With no --input the report runs with its default params. To set params or options, give a JSON object with --input:\n\n" +
			"    {\"params\": {\"period\": {\"from\": \"2026-01-01\", \"to\": \"2026-03-31\"}}, \"options\": {\"today\": \"2026-07-15\"}}\n\n" +
			"`reports show` lists the params of a report. The server checks every value and names the one it refuses.\n\n" +
			"A long report comes in pages: `next` in the --json result is the cursor of the next page, for --cursor. --all reads every page.\n" +
			"A report with groups prints its group rows; --expand-all opens every group.\n\n" +
			"An amount prints in cents. To get the report as people read it, use `reports export`.",
		Args:   reportArg(),
		Input:  reportInputSchema,
		Output: reportResultSchema,
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		raw, err := findReport(cmd.Context(), c, args[0])
		if err != nil {
			return err
		}
		req, err := fl.request(cmd, raw)
		if err != nil {
			return err
		}
		run := runReportPage
		if fl.all {
			run = runWholeReport
		}
		res, err := run(cmd.Context(), c, req, fl.cursor)
		if err != nil {
			return err
		}
		return writeReport(cmd, o, res)
	})
	bindReportInput(cmd, &fl.input)
	cmd.Flags().IntVar(&fl.limit, "limit", 0, "rows to a page; 0 is the server's page size")
	cmd.Flags().StringVar(&fl.cursor, "cursor", "", "the `next` of the page before, to read the next page")
	cmd.Flags().BoolVar(&fl.all, "all", false, "read every page")
	cmd.Flags().BoolVar(&fl.expandAll, "expand-all", false, "open every group")
	return cmd
}

// bindReportInput adds --input for a report's params and options. It is
// optional, unlike the --input of a record.
func bindReportInput(cmd *cobra.Command, path *string) {
	cmd.Flags().StringVar(path, "input", "", "JSON file that holds the params and options, or - for standard input")
}

// writeReport prints a result: the JSON document, or a table with one line for
// each row. The notices and the next page go to stderr.
func writeReport(cmd *cobra.Command, o output.Options, res reportResult) error {
	type column struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	}
	type row struct {
		Depth int            `json:"depth"`
		Label string         `json:"label"`
		Cells map[string]any `json:"cells"`
	}
	type notice struct {
		Message string `json:"message"`
	}
	columns := make([]column, len(res.Columns))
	headers := []string{"ROW"}
	for i, raw := range res.Columns {
		if err := json.Unmarshal(raw, &columns[i]); err != nil {
			return fmt.Errorf("the server's column %d is not a column: %w", i, err)
		}
		headers = append(headers, strings.ToUpper(columns[i].Label))
	}
	rows := make([][]string, len(res.Rows))
	for i, raw := range res.Rows {
		var r row
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&r); err != nil {
			return fmt.Errorf("the server's row %d is not a row: %w", i, err)
		}
		line := []string{strings.Repeat("  ", r.Depth) + r.Label}
		for _, col := range columns {
			line = append(line, cellText(r.Cells[col.ID]))
		}
		rows[i] = line
	}
	for _, raw := range res.Notices {
		var n notice
		if json.Unmarshal(raw, &n) == nil && n.Message != "" {
			o.Info(cmd.ErrOrStderr(), "Notice: %s", n.Message)
		}
	}
	if res.Next != "" {
		o.Info(cmd.ErrOrStderr(), "%d rows shown and there are more: pass --cursor %s, or --all", len(res.Rows), res.Next)
	}
	return o.Write(cmd.OutOrStdout(), headers, rows, res)
}
