package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// reportsCollection is core's collection of saved reports. Books ships its
// reports there, and a report a person builds over a Books source is there too.
const reportsCollection = "reports"

// Core's report routes: one run of a report, and a report as a file.
const (
	reportRunPath    = "/api/reports/run"
	reportExportPath = "/api/reports/export"
)

// booksSourcePrefix starts the source of every report over Books data.
const booksSourcePrefix = "books."

// reportsResource describes a saved report to the list engine. It is not in
// resources.json: a report is built in the app, so the group has no add, edit
// or delete, and `show` adds the report's params.
var reportsResource = resource{
	Name:       "reports",
	Singular:   "report",
	Summary:    "Reports: list, show, run and export the reports of Books",
	Collection: reportsCollection,
	Sort:       "title,id",
	Label:      "title",
	Columns:    []string{"title", "shipped_key", "published"},
	Search:     []string{"title", "description"},
	Fields: []field{
		{Name: "title", Type: typeString, Help: "the name of the report"},
		{Name: "description", Type: typeString, Help: "what the report shows"},
		{Name: "source", Type: typeString, Help: "the data the report reads, for example books.journal_lines"},
		{Name: "shipped_key", Type: typeString, Help: "the fixed key of a report Books ships, for example books.trial_balance; empty for a report a person built"},
		{Name: "published", Type: typeBool, Help: "true when every user who is not a guest sees the report"},
		{Name: "broken", Type: typeBool, Help: "true when the report's source no longer exists; it cannot run"},
	},
	// Only the reports over Books data: the collection holds every package's.
	// A value with a % is not wrapped by PocketBase: this is "starts with".
	where: `(source ~ "` + booksSourcePrefix + `%")`,
}

func reportArg() []argSpec {
	return []argSpec{{Name: "report", Help: "the id of the report, or the key of a report Books ships (for example books.trial_balance), as `reports list` prints them"}}
}

// findReport reads one report by its id or its shipped key. A key has a dot
// and an id has none. A report that is not over Books data is not found: this
// group runs the reports of Books only.
func findReport(ctx context.Context, c *client.Client, ref string) (rawRecord, error) {
	missing := exitcode.New(exitcode.NotFound, fmt.Errorf("no Books report %q: see `tinycld books reports list`", ref))
	var raw rawRecord
	if strings.Contains(ref, ".") {
		page, err := client.ListRecords[rawRecord](ctx, c, reportsCollection, client.ListOptions{
			Filter: client.Filter("shipped_key = {:key}", map[string]any{"key": ref}), Page: 1, PerPage: 1,
		})
		if err != nil {
			return nil, err
		}
		if len(page.Items) == 0 {
			return nil, missing
		}
		raw = page.Items[0]
	} else {
		var err error
		if raw, err = client.GetRecord[rawRecord](ctx, c, reportsCollection, ref); err != nil {
			return nil, prefixID(&reportsResource, ref, err)
		}
	}
	if source, _ := raw["source"].(string); !strings.HasPrefix(source, booksSourcePrefix) {
		return nil, missing
	}
	return raw, nil
}

// reportParams is the params of a report as its spec declares them: what
// `reports run` takes under "params". A report with none has an empty list.
func reportParams(raw rawRecord) []any {
	spec, _ := raw["spec"].(map[string]any)
	params, _ := spec["params"].([]any)
	if params == nil {
		return []any{}
	}
	return params
}

func reportShowSchema() map[string]any {
	schema := recordSchema(&reportsResource)
	schema["properties"].(map[string]any)["params"] = map[string]any{
		"type":        "array",
		"description": "the report's params, as its spec declares them: id, type, label, default, options. `reports run` takes a value for each under \"params\", by id.",
		"items":       map[string]any{"type": "object"},
	}
	schema["required"] = append(recordKeys(&reportsResource), "params")
	return schema
}

func newReportShowCmd(c *client.Client) *cobra.Command {
	return newCommand(commandDef{
		Name:    "show",
		Short:   "Show one report and the params it takes",
		Aliases: []string{"view", "get"},
		Args:    reportArg(),
		Output:  reportShowSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		raw, err := findReport(cmd.Context(), c, args[0])
		if err != nil {
			return err
		}
		rec := project(&reportsResource, raw)
		rec.keys = append(rec.keys, "params")
		rec.values["params"] = reportParams(raw)
		return writeRecord(cmd, o, rec)
	})
}

func newReportsCmd(c *client.Client) *cobra.Command {
	group := newGroup(reportsResource.Name, reportsResource.Summary)
	group.Aliases = []string{reportsResource.Singular}
	group.AddCommand(
		buildListCmd(c, &reportsResource, commandDef{
			Name:    "list",
			Short:   "List the reports of Books you can open",
			Long:    "List the reports over Books data that you can open: those Books ships, those shared with you, and your own.\n\n" + fmt.Sprint(defaultListLimit) + " to a page. " + pagingText,
			Aliases: []string{"ls"},
		}),
		newReportShowCmd(c),
	)
	return group
}
