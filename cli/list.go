package cli

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

const (
	defaultListLimit = 200
	maxListLimit     = 500
)

// listResult is what `list` prints with --json.
type listResult struct {
	Items []record `json:"items"`
	Page  int      `json:"page"`
	Limit int      `json:"limit"`
	Total int      `json:"total"`
}

type listOptions struct {
	limit        int
	page         int
	search       string
	onlyInactive bool
	all          bool
	// filters holds the value of each filter flag, by flag name.
	filters map[string]*string
}

const pagingText = "`total` in the --json result is the number of records that match on all\n" +
	"pages: ask for --page 2 while page × limit is below it."

func newListCmd(c *client.Client, res *resource) *cobra.Command {
	long := "List " + res.Name + ", " + fmt.Sprint(defaultListLimit) + " to a page.\n\n" + pagingText
	if res.hasInactive() {
		long += "\n\nInactive records are left out unless --inactive or --all is given."
	}
	return buildListCmd(c, res, commandDef{
		Name:    "list",
		Short:   "List " + res.Name,
		Long:    long,
		Aliases: []string{"ls"},
	})
}

// newViewListCmd is the list command of a view of a document: the list engine
// over the view collection, under the view's own command word.
func newViewListCmd(c *client.Client, view *listView) *cobra.Command {
	long := view.Long + "\n\n" + fmt.Sprint(defaultListLimit) + " to a page. " + pagingText
	return buildListCmd(c, &view.resource, commandDef{Name: view.Word, Short: view.Summary, Long: long})
}

// buildListCmd lists the records of res; def names the command and its help.
func buildListCmd(c *client.Client, res *resource, def commandDef) *cobra.Command {
	opts := listOptions{filters: map[string]*string{}}
	def.Output = listSchema(res)
	cmd := newCommand(def, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		if opts.limit < 1 || opts.limit > maxListLimit {
			return usagef("--limit must be from 1 to %d", maxListLimit)
		}
		if opts.page < 1 {
			return usagef("--page must be 1 or more")
		}
		// Checked here and not with cobra's MarkFlagsMutuallyExclusive: cobra
		// fails before the command runs, with exit 1 and no JSON error document.
		if opts.onlyInactive && opts.all {
			return usagef("--inactive and --all cannot be used together")
		}
		if err := checkFilterValues(cmd, res, opts); err != nil {
			return err
		}
		page, err := client.ListRecords[rawRecord](cmd.Context(), c, res.Collection, client.ListOptions{
			Filter: listFilter(cmd, res, opts), Sort: res.Sort, Page: opts.page, PerPage: opts.limit,
		})
		if err != nil {
			return err
		}
		result := listResult{Items: make([]record, 0, len(page.Items)), Page: opts.page, Limit: opts.limit, Total: page.TotalItems}
		headers := make([]string, 0, len(res.Columns)+1)
		for _, column := range res.Columns {
			headers = append(headers, strings.ToUpper(column))
		}
		headers = append(headers, "ID")
		rows := make([][]string, 0, len(page.Items))
		for _, raw := range page.Items {
			rec := project(res, raw)
			result.Items = append(result.Items, rec)
			row := make([]string, 0, len(headers))
			for _, column := range res.Columns {
				row = append(row, rec.cell(column))
			}
			rows = append(rows, append(row, rec.id()))
		}
		if shown := (opts.page-1)*opts.limit + len(result.Items); shown < result.Total {
			o.Info(cmd.ErrOrStderr(), "%d of %d %s shown: pass --page %d for more",
				shown, result.Total, res.Name, opts.page+1)
		}
		return o.Write(cmd.OutOrStdout(), headers, rows, result)
	})
	fl := cmd.Flags()
	fl.IntVar(&opts.limit, "limit", defaultListLimit, fmt.Sprintf("records to a page, from 1 to %d", maxListLimit))
	fl.IntVar(&opts.page, "page", 1, "the page to list, from 1")
	if len(res.Search) > 0 {
		fl.StringVar(&opts.search, "search", "", "only records whose "+strings.Join(res.Search, " or ")+" contains this text")
	}
	if res.hasInactive() {
		fl.BoolVar(&opts.onlyInactive, "inactive", false, "list only the inactive "+res.Name)
		fl.BoolVar(&opts.all, "all", false, "list active and inactive "+res.Name)
	}
	for _, flt := range res.Filters {
		opts.filters[flt.Flag] = fl.String(flt.Flag, flt.Default, flt.Help)
	}
	return cmd
}

// checkFilterValues refuses a filter on a select with a value the select does
// not have: the list would be empty and exit 0, and a caller reads that as "no
// such records".
func checkFilterValues(cmd *cobra.Command, res *resource, opts listOptions) error {
	for _, flt := range res.Filters {
		if !filterOn(cmd, flt, opts) {
			continue
		}
		if flt.Default != "" && *opts.filters[flt.Flag] == "" {
			return usagef("--%s is empty; give a value, or use %s to list all", flt.Flag, filterAll)
		}
		f := res.field(flt.Field)
		if f == nil || len(f.Enum) == 0 {
			continue
		}
		value := *opts.filters[flt.Flag]
		if slices.Contains(f.Enum, value) || (value == "" && !f.Required) {
			continue
		}
		allowed := f.Enum
		if flt.Default != "" {
			allowed = append(slices.Clone(f.Enum), filterAll)
		}
		return usagef("--%s %q is not a value of %s; use one of: %s", flt.Flag, value, f.Name, strings.Join(allowed, ", "))
	}
	return nil
}

// filterOn reports whether a filter flag adds a clause: a flag the caller
// gave, or a flag with a default, unless its value is filterAll.
func filterOn(cmd *cobra.Command, flt filterFlag, opts listOptions) bool {
	if flt.Default == "" {
		return cmd.Flags().Changed(flt.Flag)
	}
	return *opts.filters[flt.Flag] != filterAll
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// listFilter builds the PocketBase filter. Every value a caller typed is
// bound through client.Filter, which quotes it: a quote in --search is text to
// look for, never filter syntax.
func listFilter(cmd *cobra.Command, res *resource, opts listOptions) string {
	clauses := []string{}
	params := map[string]any{}
	if res.hasInactive() && !opts.all {
		if opts.onlyInactive {
			clauses = append(clauses, "inactive = true")
		} else {
			clauses = append(clauses, "inactive = false")
		}
	}
	// The values are from documents.json, and are bound as a caller's are.
	for i, field := range slices.Sorted(maps.Keys(res.scope)) {
		name := fmt.Sprintf("s%d", i)
		params[name] = res.scope[field]
		clauses = append(clauses, field+" = {:"+name+"}")
	}
	if res.where != "" {
		clauses = append(clauses, res.where)
	}
	for i, flt := range res.Filters {
		if !filterOn(cmd, flt, opts) {
			continue
		}
		name := fmt.Sprintf("f%d", i)
		params[name] = *opts.filters[flt.Flag]
		clauses = append(clauses, flt.Field+" = {:"+name+"}")
	}
	if opts.search != "" && len(res.Search) > 0 {
		// PocketBase's ~ wraps the value in %…% and reads % and _ as wildcards
		// (tools/search/filter.go wrapLikeParams). With every % and _ escaped
		// there is no unescaped %, so the value is wrapped as a literal contains
		// and escapeUnescapedChars keeps the escapes already there.
		params["q"] = likeEscaper.Replace(opts.search)
		alternatives := make([]string, len(res.Search))
		for i, name := range res.Search {
			alternatives[i] = name + " ~ {:q}"
		}
		clauses = append(clauses, "("+strings.Join(alternatives, " || ")+")")
	}
	return client.Filter(strings.Join(clauses, " && "), params)
}
