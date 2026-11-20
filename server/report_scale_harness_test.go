package books

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The shared harness of the aging reports' performance acceptance (A/R Aging
// spec §9, A/P Aging spec §9): the generic bulk row writer, the EXPLAIN QUERY
// PLAN reader under a given statistics reading, the query-plan bars and the
// timing. Each report's scale test passes its own large tables, table columns,
// number sequences and statistics file.

type arJELine struct {
	account       string
	debit, credit int
	customer      string
	vendor        string
}

// arBatch is one table's pending rows; every row gives every column.
type arBatch struct {
	name string
	cols []string
	rows [][]any
}

const (
	arEntries = "books_journal_entries"
	arLines   = "books_journal_lines"
)

type arWriter struct {
	t       testing.TB
	tx      core.App
	ids     int
	next    map[string]int    // doc type → next sequence
	prefix  map[string]string // doc type → number prefix
	batches map[string]*arBatch
	// columns are the columns of each table the writer writes (all of them).
	columns map[string][]string
}

// newARWriter is a writer of the tables of columns that numbers the documents
// of docTypes from their sequences.
func newARWriter(t testing.TB, tx core.App, columns map[string][]string, docTypes ...string) *arWriter {
	t.Helper()
	w := &arWriter{t: t, tx: tx, next: map[string]int{}, prefix: map[string]string{}, batches: map[string]*arBatch{}, columns: columns}
	for name, cols := range columns {
		w.batches[name] = &arBatch{name: name, cols: cols}
	}
	for _, docType := range docTypes {
		row, err := tx.FindFirstRecordByFilter("books_doc_sequences", "doc_type = {:type}", dbx.Params{"type": docType})
		if err != nil {
			t.Fatalf("no %s number sequence: %v", docType, err)
		}
		w.next[docType], w.prefix[docType] = row.GetInt("next_number"), row.GetString("prefix")
	}
	return w
}

// id is a new 15-character record id, unique in the dataset.
func (w *arWriter) id(letter string) string {
	w.ids++
	return fmt.Sprintf("ar%s%012d", letter, w.ids)
}

func (w *arWriter) row(table string, values map[string]any) {
	w.t.Helper()
	b := w.batches[table]
	row := make([]any, len(b.cols))
	for i, c := range b.cols {
		v, ok := values[c]
		if !ok {
			w.t.Fatalf("the bulk writer gives %s no %s", table, c)
		}
		row[i] = v
	}
	if len(values) != len(b.cols) {
		w.t.Fatalf("the bulk writer gives %s %d values for %d columns", table, len(values), len(b.cols))
	}
	b.rows = append(b.rows, row)
	if len(b.rows) >= 300 {
		w.flush(b)
	}
}

// flush inserts a batch's rows in one statement. The statement log is off for
// it: dbx's log text replaces each of thousands of params in the whole SQL.
func (w *arWriter) flush(b *arBatch) {
	w.t.Helper()
	if len(b.rows) == 0 {
		return
	}
	params := dbx.Params{}
	var sql strings.Builder
	sql.WriteString("INSERT INTO `" + b.name + "` (`" + strings.Join(b.cols, "`, `") + "`) VALUES ")
	k := 0
	for r, row := range b.rows {
		if r > 0 {
			sql.WriteString(", ")
		}
		sql.WriteString("(")
		for c, v := range row {
			if c > 0 {
				sql.WriteString(", ")
			}
			name := "p" + strconv.Itoa(k)
			k++
			sql.WriteString("{:" + name + "}")
			params[name] = v
		}
		sql.WriteString(")")
	}
	q := w.tx.DB().NewQuery(sql.String()).Bind(params)
	q.ExecLogFunc, q.QueryLogFunc, q.LogFunc = nil, nil, nil
	if _, err := q.Execute(); err != nil {
		w.t.Fatalf("insert %d rows into %s: %v", len(b.rows), b.name, err)
	}
	b.rows = b.rows[:0]
}

// finish writes the pending rows and moves each number sequence past the
// numbers the dataset took.
func (w *arWriter) finish() {
	w.t.Helper()
	for _, name := range slices.Sorted(maps.Keys(w.columns)) {
		w.flush(w.batches[name])
	}
	for docType, next := range w.next {
		if _, err := w.tx.DB().Update("books_doc_sequences", dbx.Params{"next_number": next},
			dbx.HashExp{"doc_type": docType}).Execute(); err != nil {
			w.t.Fatalf("advance the %s sequence: %v", docType, err)
		}
	}
}

func (w *arWriter) entry(values map[string]any) {
	values["auto_reverse_on"], values["close_override"], values["currency"], values["replaces"] = "", "", "USD", ""
	w.row(arEntries, values)
}

// lines writes an entry's lines in position order; reversed swaps each debit
// and credit, as a reversal does.
func (w *arWriter) lines(entry, date, stamp string, lines []arJELine, reversed bool) []string {
	ids := make([]string, len(lines))
	for pos, l := range lines {
		debit, credit := l.debit, l.credit
		if reversed {
			debit, credit = credit, debit
		}
		ids[pos] = w.id("l")
		w.row(arLines, map[string]any{
			"id": ids[pos], "account": l.account, "created": stamp, "updated": stamp, "credit": credit,
			"debit": debit, "currency": "USD", "customer": l.customer, "date": date, "entry": entry, "memo": "",
			"position": pos, "posted": true, "vendor": l.vendor,
		})
	}
	return ids
}

// planStep is one row of EXPLAIN QUERY PLAN of the statement at index
// Statement. Tables are the tables a SCAN or SEARCH step reads: the plan names
// an alias, and an alias may name more than one table. Subs are the common
// table expressions the step's alias names ("SCAN o" for "FROM o1 o").
type planStep struct {
	Statement  int
	ID, Parent int
	Detail     string
	Tables     []string
	Subs       []string
}

// arStat is one sqlite_stat1 row.
type arStat struct {
	Tbl  string  `json:"tbl"`
	Idx  *string `json:"idx"`
	Stat string  `json:"stat"`
}

// arReading is how the planner sees the statistics: none, the rows given, or
// a real ANALYZE of the dataset.
type arReading struct {
	name    string
	stats   []arStat
	analyze bool
}

// explainStatements reads each statement's plan with no statistics.
func explainStatements(t testing.TB, app core.App, statements []string) []planStep {
	t.Helper()
	steps, _ := explainReading(t, app, arReading{name: "no statistics"}, statements)
	return steps
}

// explainReading reads each statement's plan under reading, on ONE connection
// (D10): a transaction that creates sqlite_stat1, sets its rows (or runs a real
// ANALYZE), has the planner load them, explains, and rolls back. It returns
// the steps and, for a real ANALYZE, the sqlite_stat1 rows it wrote.
func explainReading(t testing.TB, app core.App, reading arReading, statements []string) ([]planStep, []arStat) {
	t.Helper()
	db, ok := app.NonconcurrentDB().(*dbx.DB)
	if !ok {
		t.Fatalf("the app's builder is %T, want *dbx.DB", app.NonconcurrentDB())
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("%s: begin: %v", reading.name, err)
	}
	defer func() { _ = tx.Rollback() }()
	exec := func(sql string, params dbx.Params) {
		t.Helper()
		if _, err := tx.NewQuery(sql).Bind(params).Execute(); err != nil {
			t.Fatalf("%s: %s: %v", reading.name, sql, err)
		}
	}
	var stats []arStat
	if reading.analyze {
		exec("ANALYZE", nil)
		if err := tx.NewQuery("SELECT tbl, idx, stat FROM sqlite_stat1 ORDER BY tbl, idx").All(&stats); err != nil {
			t.Fatalf("%s: read sqlite_stat1: %v", reading.name, err)
		}
	} else {
		// ANALYZE of a small table creates sqlite_stat1 without reading the book.
		exec("ANALYZE `books_doc_sequences`", nil)
		exec("DELETE FROM sqlite_stat1", nil)
		var stat4 int
		_ = tx.NewQuery("SELECT COUNT(*) FROM sqlite_master WHERE name = 'sqlite_stat4'").Row(&stat4)
		if stat4 > 0 {
			exec("DELETE FROM sqlite_stat4", nil)
		}
		for _, s := range reading.stats {
			exec("INSERT INTO sqlite_stat1 (tbl, idx, stat) VALUES ({:t}, {:i}, {:s})",
				dbx.Params{"t": s.Tbl, "i": s.Idx, "s": s.Stat})
		}
		exec("ANALYZE sqlite_schema", nil)
	}
	schema := arSchemaOf(t, tx)
	var steps []planStep
	for i, s := range statements {
		var rows []struct {
			ID      int    `db:"id"`
			Parent  int    `db:"parent"`
			Notused int    `db:"notused"`
			Detail  string `db:"detail"`
		}
		if err := tx.NewQuery("EXPLAIN QUERY PLAN " + s).All(&rows); err != nil {
			t.Errorf("%s: EXPLAIN QUERY PLAN failed: %v\nstatement: %s", reading.name, err, s)
			continue
		}
		names := schema.aliases(s)
		subs := map[string]bool{}
		for _, r := range rows {
			if verb, name := stepVerb(r.Detail); verb == "MATERIALIZE" || verb == "CO-ROUTINE" {
				subs[name] = true
			}
		}
		for _, r := range rows {
			step := planStep{Statement: i, ID: r.ID, Parent: r.Parent, Detail: r.Detail}
			step.Tables = schema.tablesOf(r.Detail, names)
			verb, name := stepVerb(r.Detail)
			if verb == "SCAN" || verb == "SEARCH" {
				step.Subs = names.subs[name]
			}
			if (verb == "SCAN" || verb == "SEARCH") && step.Tables == nil && step.Subs == nil && !subs[name] && name != "CONSTANT" && !strings.HasPrefix(name, "(") {
				t.Errorf("%s: cannot tell the table of step %q\nstatement: %s", reading.name, r.Detail, s)
			}
			steps = append(steps, step)
		}
	}
	return steps, stats
}

// arSchema is what the plan's names resolve against.
type arSchema struct {
	tables     map[string]bool // tables and views
	indexTable map[string]string
	viewSQL    []string
	columns    map[string]map[string]bool
}

func arSchemaOf(t testing.TB, tx *dbx.Tx) arSchema {
	t.Helper()
	var rows []struct {
		Type    string         `db:"type"`
		Name    string         `db:"name"`
		TblName string         `db:"tbl_name"`
		SQL     sql.NullString `db:"sql"`
	}
	if err := tx.NewQuery("SELECT type, name, tbl_name, sql FROM sqlite_master").All(&rows); err != nil {
		t.Fatalf("read sqlite_master: %v", err)
	}
	s := arSchema{tables: map[string]bool{}, indexTable: map[string]string{}, columns: map[string]map[string]bool{}}
	for _, r := range rows {
		switch r.Type {
		case "table":
			s.tables[r.Name] = true
		case "view":
			s.tables[r.Name] = true
			s.viewSQL = append(s.viewSQL, r.SQL.String)
		case "index":
			s.indexTable[r.Name] = r.TblName
		}
	}
	var cols []struct {
		Tbl string `db:"tbl"`
		Col string `db:"col"`
	}
	if err := tx.NewQuery("SELECT m.name AS tbl, p.name AS col FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type IN ('table', 'view')").All(&cols); err != nil {
		t.Fatalf("read the columns: %v", err)
	}
	for _, c := range cols {
		if s.columns[c.Tbl] == nil {
			s.columns[c.Tbl] = map[string]bool{}
		}
		s.columns[c.Tbl][c.Col] = true
	}
	return s
}

var (
	arFromRe  = regexp.MustCompile(`(?i)\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?`)
	arIndexRe = regexp.MustCompile(`USING (?:COVERING )?INDEX (\S+)`)
	// arCTERe finds the name of each common table expression: "name AS (",
	// "name AS MATERIALIZED (" or "name AS NOT MATERIALIZED (".
	arCTERe        = regexp.MustCompile(`(?i)\b([A-Za-z_][A-Za-z0-9_]*)\s+AS\s+(?:NOT\s+)?(?:MATERIALIZED\s+)?\(`)
	arAutoColsRe   = regexp.MustCompile(`AUTOMATIC (?:PARTIAL )?(?:COVERING )?INDEX \(([^)]*)\)`)
	arAutoColRe    = regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)[<>=]`)
	arSchemaTables = map[string]bool{"sqlite_schema": true, "sqlite_master": true, "sqlite_temp_schema": true}
	arSQLWord      = map[string]bool{
		"ON": true, "WHERE": true, "JOIN": true, "LEFT": true, "RIGHT": true, "FULL": true, "INNER": true,
		"OUTER": true, "CROSS": true, "NATURAL": true, "GROUP": true, "ORDER": true, "LIMIT": true, "USING": true,
		"UNION": true, "WINDOW": true, "HAVING": true, "INDEXED": true, "NOT": true, "AS": true, "SELECT": true,
		"EXCEPT": true, "INTERSECT": true, "OFFSET": true, "WITH": true, "VALUES": true, "SET": true,
	}
)

// arNames is what the names of one statement's FROM and JOIN clauses (and of
// the views it reads) stand for: tables maps a name to the tables it names,
// subs maps a name to the common table expressions (WITH ... AS) it names.
type arNames struct {
	tables, subs map[string][]string
}

func arAdd(m map[string][]string, key, value string) {
	if !slices.Contains(m[key], value) {
		m[key] = append(m[key], value)
	}
}

// aliases resolves the names of statement's FROM and JOIN clauses and of the
// views' FROM and JOIN clauses.
func (s arSchema) aliases(statement string) arNames {
	clean := strings.NewReplacer("`", "", `"`, "", "{{", "", "}}", "", "[[", "", "]]", "", "[", "", "]", "")
	out := arNames{tables: map[string][]string{}, subs: map[string][]string{}}
	ctes := map[string]bool{}
	for _, m := range arCTERe.FindAllStringSubmatch(clean.Replace(statement), -1) {
		if !arSQLWord[strings.ToUpper(m[1])] {
			ctes[m[1]] = true
		}
	}
	for _, text := range append([]string{statement}, s.viewSQL...) {
		for _, m := range arFromRe.FindAllStringSubmatch(clean.Replace(text), -1) {
			name, alias := m[1], m[2]
			if alias == "" || arSQLWord[strings.ToUpper(alias)] {
				alias = name
			}
			switch {
			case ctes[name]:
				arAdd(out.subs, alias, name)
			case s.tables[name]:
				arAdd(out.tables, alias, name)
			}
		}
	}
	return out
}

// tablesOf is the table(s) a SCAN or SEARCH step reads: its index's table, the
// table its name or alias names, or the name of a table-valued function or the
// schema table (none of them large).
func (s arSchema) tablesOf(detail string, names arNames) []string {
	verb, name := stepVerb(detail)
	if verb != "SCAN" && verb != "SEARCH" {
		return nil
	}
	if m := arIndexRe.FindStringSubmatch(detail); m != nil {
		if table, ok := s.indexTable[m[1]]; ok {
			return []string{table}
		}
	}
	if s.tables[name] || strings.Contains(detail, "VIRTUAL TABLE") || arSchemaTables[strings.TrimPrefix(name, "main.")] {
		return []string{name}
	}
	tables := names.tables[name]
	m := arAutoColsRe.FindStringSubmatch(detail)
	if m == nil || names.subs[name] == nil {
		return tables
	}
	// A name that is both a table's alias and a common table expression's: an
	// AUTOMATIC index keeps the tables that have every column it names.
	var out []string
	for _, table := range tables {
		has := true
		for _, col := range arAutoColRe.FindAllStringSubmatch(m[1], -1) {
			has = has && s.columns[table][col[1]]
		}
		if has {
			out = append(out, table)
		}
	}
	return out
}

// stepVerb is a plan step's first word and the name after it.
func stepVerb(detail string) (string, string) {
	f := strings.Fields(detail)
	switch len(f) {
	case 0:
		return "", ""
	case 1:
		return f[0], ""
	}
	return f[0], f[1]
}

var arNeverScanned = []string{"books_journal_lines", "books_journal_entries"}

func arReadsAny(step planStep, tables []string) bool {
	return slices.ContainsFunc(step.Tables, func(t string) bool { return slices.Contains(tables, t) })
}

// arLoopSteps marks the steps inside a loop: a SCAN or SEARCH that is not the
// first loop of its query block, every step under a CORRELATED subquery, and
// every step under a step inside a loop. A MATERIALIZE runs once, so the steps
// that build it start outside any loop.
func arLoopSteps(steps []planStep) map[int]bool {
	children := map[int][]planStep{}
	for _, s := range steps {
		children[s.Parent] = append(children[s.Parent], s)
	}
	out := map[int]bool{}
	var walk func(parent int, inLoop bool)
	walk = func(parent int, inLoop bool) {
		loopSeen := false
		for _, c := range children[parent] {
			verb, name := stepVerb(c.Detail)
			isLoop := verb == "SEARCH" || verb == "MULTI-INDEX" || (verb == "SCAN" && name != "CONSTANT")
			in := inLoop
			if isLoop {
				in = in || loopSeen
				loopSeen = true
			}
			out[c.ID] = in
			switch {
			case verb == "MATERIALIZE":
				// A materialized subquery is built once, wherever the plan nests it.
				walk(c.ID, false)
			default:
				walk(c.ID, in || strings.HasPrefix(c.Detail, "CORRELATED"))
			}
		}
	}
	walk(0, false)
	return out
}

// arSubtreeReadsLarge reports whether a step under id reads a table of large.
func arSubtreeReadsLarge(steps []planStep, id int, large []string) bool {
	for _, s := range steps {
		if s.Parent == id && (arReadsAny(s, large) || arSubtreeReadsLarge(steps, s.ID, large)) {
			return true
		}
	}
	return false
}

// checkPlanBars fails each step of statement's plan that breaks a query-plan
// bar of spec §9 over the report's large tables, naming the run, the reading,
// the step and the statement.
func checkPlanBars(t testing.TB, run arRun, statement string, steps []planStep, large []string) {
	t.Helper()
	fail := func(step planStep, bar string) {
		t.Helper()
		t.Errorf("run %s, %s: step %q %s\nstatement: %s", run.name, run.reading, step.Detail, bar, statement)
	}
	inLoop := arLoopSteps(steps)
	var outermost []planStep
	for _, s := range steps {
		verb, _ := stepVerb(s.Detail)
		isLarge := arReadsAny(s, large)
		if strings.Contains(s.Detail, "AUTOMATIC") && isLarge {
			fail(s, "builds an AUTOMATIC index on a large table")
		}
		if verb != "SCAN" || !isLarge {
			continue
		}
		switch {
		case arReadsAny(s, arNeverScanned):
			fail(s, "scans books_journal_lines or books_journal_entries (each must be read by SEARCH)")
		case run.bound:
			fail(s, "scans a large table in a statement bound to picked parties, one party or one item")
		case inLoop[s.ID]:
			fail(s, "scans a large table inside a loop")
		case !run.wholeBook:
			fail(s, "scans a large table in a run that does not read the whole book")
		default:
			outermost = append(outermost, s)
		}
	}
	for _, s := range outermost[min(1, len(outermost)):] {
		fail(s, "is a second outermost SCAN of a large table (at most one is permitted)")
	}
	for _, m := range steps {
		verb, name := stepVerb(m.Detail)
		if (verb != "MATERIALIZE" && verb != "CO-ROUTINE") || !arSubtreeReadsLarge(steps, m.ID, large) {
			continue
		}
		for _, s := range steps {
			if v, n := stepVerb(s.Detail); v == "SCAN" && (n == name || slices.Contains(s.Subs, name)) && inLoop[s.ID] {
				fail(s, fmt.Sprintf("scans %s inside a loop, which %q builds whole from a large table", name, m.Detail))
			}
		}
	}
}

// arStepsOf are the steps of the statement at index i.
func arStepsOf(steps []planStep, i int) []planStep {
	var out []planStep
	for _, s := range steps {
		if s.Statement == i {
			out = append(out, s)
		}
	}
	return out
}

// arLStats are the L dataset's sqlite_stat1 rows of testdata/file (written by
// the BOOKS_SCALE run).
func arLStats(t testing.TB, file string) []arStat {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", file))
	if err != nil {
		t.Fatalf("read the L statistics: %v", err)
	}
	var stats []arStat
	if err := json.Unmarshal(raw, &stats); err != nil {
		t.Fatalf("parse the L statistics: %v", err)
	}
	return stats
}

// arPlanRecorder takes the failures checkPlanBars reports, so a test can
// expect one.
type arPlanRecorder struct {
	testing.TB
	errs []string
}

func (r *arPlanRecorder) Helper() {}

func (r *arPlanRecorder) Errorf(format string, args ...any) {
	r.errs = append(r.errs, fmt.Sprintf(format, args...))
}

// arWithin reports whether got is within pct percent of want.
func arWithin(got, want, pct int) bool {
	d := got - want
	if d < 0 {
		d = -d
	}
	return d*100 <= want*pct
}

// arMedian runs fn once to warm up, then 5 times, and returns the median.
func arMedian(fn func()) time.Duration {
	fn()
	times := make([]time.Duration, 5)
	for i := range times {
		start := time.Now()
		fn()
		times[i] = time.Since(start)
	}
	slices.Sort(times)
	return times[2]
}

// arReads is one line per SCAN or SEARCH step: the tables and how it reads them.
func arReads(steps []planStep) string {
	var out []string
	for _, s := range steps {
		verb, _ := stepVerb(s.Detail)
		if verb != "SCAN" && verb != "SEARCH" {
			continue
		}
		how := "full scan"
		switch {
		case strings.Contains(s.Detail, "USING "):
			how = s.Detail[strings.Index(s.Detail, "USING "):]
		case verb == "SEARCH":
			how = "search"
		}
		tables := strings.Join(s.Tables, "|")
		if tables == "" {
			_, tables = stepVerb(s.Detail)
		}
		out = append(out, verb+" "+tables+" "+how)
	}
	return strings.Join(out, "; ")
}

// arPlanText is a plan as an indented tree.
func arPlanText(steps []planStep) string {
	depth := map[int]int{0: -1}
	var b strings.Builder
	for _, s := range steps {
		depth[s.ID] = depth[s.Parent] + 1
		b.WriteString(strings.Repeat("  ", max(depth[s.ID], 0)) + s.Detail + "\n")
	}
	return b.String()
}
