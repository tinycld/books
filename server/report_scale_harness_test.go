package books

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"math/rand/v2"
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
	// copies are the card mark and the doc type of each entry the writer
	// wrote, which its lines copy as posting stamps them (lines.go).
	copies map[string]arEntryCopy
}

// arEntryCopy is an entry's card mark and doc type, as its lines hold them.
type arEntryCopy struct {
	card    bool
	docType string
}

// newARWriter is a writer of the tables of columns that numbers the documents
// of docTypes from their sequences.
func newARWriter(t testing.TB, tx core.App, columns map[string][]string, docTypes ...string) *arWriter {
	t.Helper()
	w := &arWriter{t: t, tx: tx, next: map[string]int{}, prefix: map[string]string{}, batches: map[string]*arBatch{}, columns: columns, copies: map[string]arEntryCopy{}}
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
	// The writer leaves an entry's card_payment at its column default (false);
	// a pass that marks it later moves the lines' copies with it.
	card, _ := values["card_payment"].(bool)
	docType, _ := values["doc_type"].(string)
	w.copies[values["id"].(string)] = arEntryCopy{card: card, docType: docType}
	w.row(arEntries, values)
}

// lines writes an entry's lines in position order; reversed swaps each debit
// and credit, as a reversal does. Each line holds its entry's card mark and doc
// type.
func (w *arWriter) lines(entry, date, stamp string, lines []arJELine, reversed bool) []string {
	w.t.Helper()
	copied, ok := w.copies[entry]
	if !ok {
		w.t.Fatalf("the bulk writer writes lines of entry %s before the entry", entry)
	}
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
			"card_payment": copied.card, "doc_type": copied.docType,
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

// arStat4 is one sqlite_stat4 row: the samples a real ANALYZE takes of an
// index, which the planner reads for a range or an IN term.
type arStat4 struct {
	Tbl    string `json:"tbl" db:"tbl"`
	Idx    string `json:"idx" db:"idx"`
	Neq    string `json:"neq" db:"neq"`
	Nlt    string `json:"nlt" db:"nlt"`
	Ndlt   string `json:"ndlt" db:"ndlt"`
	Sample []byte `json:"sample" db:"sample"`
}

// arReading is how the planner sees the statistics: none, the rows given
// (sqlite_stat1, and sqlite_stat4 when stat4 has rows), or a real ANALYZE of
// the dataset.
type arReading struct {
	name    string
	stats   []arStat
	stat4   []arStat4
	analyze bool
}

// explainStatements reads each statement's plan with no statistics.
func explainStatements(t testing.TB, app core.App, statements []string) []planStep {
	t.Helper()
	steps, _ := explainReading(t, app, arReading{name: "no statistics"}, statements)
	return steps
}

// stepsRunPerRow is steps without the subtrees of a LIST SUBQUERY that SQLite
// builds once for its statement (core's cut of the rows to the open sections
// reads gord in one), so a scan inside it reads no table again for each row.
// A subquery the plan names CORRELATED runs once per outer row: its steps stay,
// also under a list, because each of its runs reads its tables.
func stepsRunPerRow(steps []planStep) []planStep {
	type node struct{ statement, id int }
	byID := map[node]planStep{}
	for _, s := range steps {
		byID[node{s.Statement, s.ID}] = s
	}
	builtOnce := func(s planStep) bool {
		once := false
		for cur, ok := s, true; ok; cur, ok = byID[node{s.Statement, cur.Parent}] {
			if strings.HasPrefix(cur.Detail, "CORRELATED ") {
				return false
			}
			once = once || strings.HasPrefix(cur.Detail, "LIST SUBQUERY")
		}
		return once
	}
	var out []planStep
	for _, s := range steps {
		if !builtOnce(s) {
			out = append(out, s)
		}
	}
	return out
}

// explainReading reads each statement's plan under reading, on ONE connection
// (D10): a transaction that creates sqlite_stat1, sets its rows (or runs a real
// ANALYZE), has the planner load them, explains, and rolls back. It returns
// the steps and, for a real ANALYZE, the sqlite_stat1 rows it wrote.
func explainReading(t testing.TB, app core.App, reading arReading, statements []string) ([]planStep, []arStat) {
	t.Helper()
	steps, stats, _ := explainReadingStats(t, app, reading, statements)
	return steps, stats
}

// explainReadingStats is explainReading that also returns, for a real ANALYZE,
// the sqlite_stat4 rows it wrote. A reading with stat4 rows inserts them into
// sqlite_stat4 with its sqlite_stat1 rows, so a replay of an ANALYZE gives the
// planner the same samples.
func explainReadingStats(t testing.TB, app core.App, reading arReading, statements []string) ([]planStep, []arStat, []arStat4) {
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
	var samples []arStat4
	if reading.analyze {
		exec("ANALYZE", nil)
		if err := tx.NewQuery("SELECT tbl, idx, stat FROM sqlite_stat1 ORDER BY tbl, idx").All(&stats); err != nil {
			t.Fatalf("%s: read sqlite_stat1: %v", reading.name, err)
		}
		if arHasStat4(tx) {
			// rowid order is the order ANALYZE wrote them: each index's
			// samples in key order, as the planner loads them.
			if err := tx.NewQuery("SELECT tbl, idx, neq, nlt, ndlt, sample FROM sqlite_stat4 ORDER BY rowid").All(&samples); err != nil {
				t.Fatalf("%s: read sqlite_stat4: %v", reading.name, err)
			}
		}
	} else {
		// ANALYZE of a small table creates sqlite_stat1 without reading the book.
		exec("ANALYZE `books_doc_sequences`", nil)
		exec("DELETE FROM sqlite_stat1", nil)
		hasStat4 := arHasStat4(tx)
		if hasStat4 {
			exec("DELETE FROM sqlite_stat4", nil)
		}
		for _, s := range reading.stats {
			exec("INSERT INTO sqlite_stat1 (tbl, idx, stat) VALUES ({:t}, {:i}, {:s})",
				dbx.Params{"t": s.Tbl, "i": s.Idx, "s": s.Stat})
		}
		if len(reading.stat4) > 0 && !hasStat4 {
			t.Fatalf("%s: the reading has %d sqlite_stat4 rows, but this SQLite has no sqlite_stat4 table", reading.name, len(reading.stat4))
		}
		for _, s := range reading.stat4 {
			exec("INSERT INTO sqlite_stat4 (tbl, idx, neq, nlt, ndlt, sample) VALUES ({:t}, {:i}, {:neq}, {:nlt}, {:ndlt}, {:sample})",
				dbx.Params{"t": s.Tbl, "i": s.Idx, "neq": s.Neq, "nlt": s.Nlt, "ndlt": s.Ndlt, "sample": s.Sample})
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
	return steps, stats, samples
}

// arHasStat4 reports whether tx's database has a sqlite_stat4 table: ANALYZE
// creates it when SQLite is built with STAT4.
func arHasStat4(tx *dbx.Tx) bool {
	var n int
	_ = tx.NewQuery("SELECT COUNT(*) FROM sqlite_master WHERE name = {:name}").Bind(dbx.Params{"name": "sqlite_stat4"}).Row(&n)
	return n > 0
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

// arStatsFile is a testdata statistics file with the sqlite_stat1 and the
// sqlite_stat4 rows of one real ANALYZE (written by a BOOKS_SCALE run).
type arStatsFile struct {
	Stat1 []arStat  `json:"stat1"`
	Stat4 []arStat4 `json:"stat4"`
}

// arLStatReading is the reading named name that replays the sqlite_stat1 and
// sqlite_stat4 rows of testdata/file (an arStatsFile).
func arLStatReading(t testing.TB, name, file string) arReading {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", file))
	if err != nil {
		t.Fatalf("read the L statistics: %v", err)
	}
	var stats arStatsFile
	if err := json.Unmarshal(raw, &stats); err != nil {
		t.Fatalf("parse the L statistics: %v", err)
	}
	return arReading{name: name, stats: stats.Stat1, stat4: stats.Stat4}
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

// apLastDay is the last day of every dataset and the reader's day of every
// run: the runs' default As of (Today) is the last day of the data.
const apLastDay = apToday

const (
	apKindBill        = "bill"
	apKindPayment     = "bill_payment"
	apKindCredit      = "vendor_credit"
	apKindApplication = "application" // a vendor credit application: no entry, no number
	apKindRefund      = "vendor_refund"
	apKindJournal     = "journal"
)

const (
	apBills        = "books_bills"
	apPayments     = "books_bill_payments"
	apPaymentLines = "books_bill_payment_lines"
	apCredits      = "books_vendor_credits"
	apApplications = "books_vendor_credit_applications"
	apRefunds      = "books_vendor_refunds"
	apRefundLines  = "books_vendor_refund_lines"
)

// apTableColumns are the columns of each table posting writes (all of them).
var apTableColumns = map[string][]string{
	arEntries: arTableColumns[arEntries],
	arLines:   arTableColumns[arLines],
	apBills: {"balance", "created", "currency", "date", "due_date", "entry", "fields", "form", "id", "mailing_address",
		"memo", "number", "posted_at", "posted_by", "ref_no", "replaced_by", "replaces", "revision", "sequence", "sort_key",
		"status", "subtotal", "terms", "total", "updated", "vendor", "voided_at", "voided_by"},
	apPayments: {"created", "currency", "date", "entry", "id", "number", "paid_from", "payment_method", "posted_at",
		"posted_by", "reference_no", "replaced_by", "replaces", "sequence", "sort_key", "status", "total", "updated",
		"vendor", "voided_at", "voided_by"},
	apPaymentLines: {"amount", "bill", "created", "id", "payment", "position", "updated"},
	apCredits: {"balance", "created", "currency", "date", "entry", "fields", "form", "id", "memo", "number", "posted_at",
		"posted_by", "ref_no", "replaced_by", "replaces", "revision", "sequence", "sort_key", "status", "subtotal", "total",
		"updated", "vendor", "voided_at", "voided_by"},
	apApplications: {"amount", "applied_by", "bill", "close_override", "created", "date", "id", "vendor_credit"},
	apRefunds: {"amount", "created", "currency", "date", "entry", "id", "memo", "number", "payment_method", "posted_at",
		"posted_by", "reference_no", "refunded_to", "replaced_by", "replaces", "sequence", "sort_key", "status", "updated",
		"vendor", "voided_at", "voided_by"},
	apRefundLines: {"amount", "created", "id", "position", "refund", "updated", "vendor_credit"},
}

// apSize is one dataset size, chosen so that the generated book has the row
// counts of the spec §9 table (apSpecTable) within 5 %: openBills stay open
// (partPaid of them part paid), closedBills are paid in full by one payment
// line each, pairPayments of the payments pay two bills of one vendor,
// voidPayments pay part of a closed bill and are voided; fullApplied credits
// are applied whole and partApplied in part to an open bill, refunded credits
// are refunded whole; manual are manual Accounts payable lines, one in ten
// with no vendor.
type apSize struct {
	name                                        string
	lines, vendors                              int
	openBills, partPaid, closedBills, voidBills int
	pairPayments, voidPayments                  int
	fullApplied, partApplied, refunded          int
	manual                                      int
	// plan, when set, is written as it is in place of a generated book.
	plan []apDoc
}

var (
	// apSmall is the plan check's book (about 500 lines) with every row kind
	// of the §9 table.
	apSmall = apSize{
		name: "small", lines: 500, vendors: 30,
		openBills: 15, partPaid: 3, closedBills: 80, voidBills: 2, pairPayments: 8, voidPayments: 3,
		fullApplied: 3, partApplied: 2, refunded: 2, manual: 10,
	}
	// Spec §9's counts cannot all hold at once: 10,000 bills with 9,000
	// payment lines leave about 850 or more open items, against "about 800".
	// So S and L write bills 3 % under the table (9,700 and 97,000), inside
	// arWithin's 5 %.
	apS = apSize{
		name: "S", lines: 50000, vendors: 200,
		openBills: 650, partPaid: 50, closedBills: 8950, voidBills: 100, pairPayments: 1100, voidPayments: 100,
		fullApplied: 100, partApplied: 50, refunded: 50, manual: 100,
	}
	apL = apSize{
		name: "L", lines: 500000, vendors: 2000,
		openBills: 6500, partPaid: 500, closedBills: 89500, voidBills: 1000, pairPayments: 11000, voidPayments: 1000,
		fullApplied: 1000, partApplied: 500, refunded: 500, manual: 1000,
	}
)

// apCounts are the row counts of the spec §9 table.
type apCounts struct {
	lines, vendors, bills, payments, paymentLines, credits, applications int
	refunds, manual, voidBills, voidPayments, openItems                  int
}

// apSpecTable is the spec §9 Dataset table.
var apSpecTable = map[string]apCounts{
	"S": {lines: 50000, vendors: 200, bills: 10000, payments: 8000, paymentLines: 9000, credits: 200, applications: 150,
		refunds: 50, manual: 100, voidBills: 100, voidPayments: 100, openItems: 800},
	"L": {lines: 500000, vendors: 2000, bills: 100000, payments: 80000, paymentLines: 90000, credits: 2000, applications: 1500,
		refunds: 500, manual: 1000, voidBills: 1000, voidPayments: 1000, openItems: 8000},
}

// apPart is cents of a payment line or a refund line on the plan document at
// index doc (a bill, a vendor credit).
type apPart struct{ doc, cents int }

// apDoc is one document of a dataset plan.
type apDoc struct {
	kind   string
	vendor string
	date   string
	due    string // a bill's due day
	// cents is a bill's or vendor credit's total, an application's amount.
	cents int
	parts []apPart // a bill payment's or vendor refund's lines
	// bill and credit are an application's bill and vendor credit (plan indexes).
	bill, credit int
	lines        []arJELine // a journal entry's lines, in position order
	memo         string     // a journal entry's memo
	void         bool       // voided, with its reversal entry
	actor        string     // who saved and posted it ("" for postJournal's entries)
	voider       string     // who voided it
}

// apWritten are the ids the writer gave one document of the plan.
type apWritten struct {
	kind, id, entry, number string
	lines, parts            []string
	reversal                string
	reversalLines           []string
}

// apItem is one open item of the writer's record: its vendor ("" for none)
// and what the business owes on it (a vendor credit is negative).
type apItem struct {
	vendor string
	owed   int
}

// apDataset is a written book: its days, its vendors, what the runs of spec §9
// pick from it, and the writer's record of the open items on the last and the
// middle day (item id → item).
type apDataset struct {
	size                      apSize
	firstDay, midDay, lastDay string
	vendors                   []string
	// picked are the five vendors of run 4.
	picked []string
	// busiest is the vendor with the most open items (run 5), busiestBill its
	// oldest open bill that has a payment (run 6).
	busiest, busiestBill string
	// vendorKey and itemKey are the group keys of the busiest vendor's row and
	// of busiestBill's row, as a run gives them.
	vendorKey, itemKey []any
	docs               []apWritten
	// plan is what the writer wrote, in the order of docs.
	plan              []apDoc
	openLast, openMid map[string]apItem
}

// writeAPDataset writes size's book to b in one transaction, straight to the
// tables through the shared row writer, with the columns posting writes:
// vendors through the app (their guards set the sort keys), every posted row
// by batched inserts, then the stored payable rows by payableItems.rebuild.
func writeAPDataset(t *testing.T, b apBook, size apSize) apDataset {
	t.Helper()
	data := apDataset{size: size, firstDay: arDay(0), midDay: arDay(arDayCount() / 2), lastDay: apLastDay}
	var plan []apDoc
	err := b.app.RunInTransaction(func(tx core.App) error {
		plan = size.plan
		busiestBill := -1
		if plan == nil {
			data.vendors = make([]string, size.vendors)
			for i := range data.vendors {
				data.vendors[i] = mkVendor(t, tx, arClip(fmt.Sprintf("Vendor %05d", i))).Id
			}
			plan, busiestBill = apGeneratePlan(t, b, size, &data)
		}
		w := newARWriter(t, tx, apTableColumns, apKindBill, apKindPayment, apKindCredit, apKindRefund, apKindJournal)
		data.docs = apWrite(w, plan, b)
		if busiestBill >= 0 {
			data.busiestBill = data.docs[busiestBill].id
		}
		w.finish()
		return payableItems.rebuild(tx)
	})
	if err != nil {
		t.Fatalf("write the %s dataset: %v", size.name, err)
	}
	data.plan = plan
	data.openLast = apRecord(plan, data.docs, b.payable.Id, data.lastDay)
	data.openMid = apRecord(plan, data.docs, b.payable.Id, data.midDay)
	return data
}

// apGeneratePlan builds size's documents from a fixed seed. It returns the
// plan and the plan index of the busiest vendor's oldest part-paid bill.
func apGeneratePlan(t testing.TB, b apBook, size apSize, data *apDataset) ([]apDoc, int) {
	t.Helper()
	rng := rand.New(rand.NewPCG(20261120, uint64(size.lines)))
	actor, voider := b.users.bookkeeper.Id, b.users.admin.Id
	vendors := data.vendors
	n := arDayCount()
	anyVendor := func() string { return vendors[rng.IntN(len(vendors))] }
	cents := func() int { return 5000 + rng.IntN(495000) }
	later := func(day, most int) int { return min(day+rng.IntN(most+1), n-1) }

	var plan []apDoc
	var days []int
	add := func(d apDoc, day int) int {
		d.date, d.actor = arDay(day), actor
		if d.void {
			d.voider = voider
		}
		plan = append(plan, d)
		days = append(days, day)
		return len(plan) - 1
	}
	bill := func(vendor string, day int, void bool) int {
		return add(apDoc{kind: apKindBill, vendor: vendor, due: arDay(day + 30), cents: cents(), void: void}, day)
	}
	payment := func(vendor string, day int, void bool, parts ...apPart) int {
		return add(apDoc{kind: apKindPayment, vendor: vendor, parts: parts, void: void}, day)
	}

	busiestOpen := min(size.openBills, max(size.openBills/20, 5))
	open := make([]int, size.openBills)
	for k := range open {
		v := anyVendor()
		if k < busiestOpen {
			v = vendors[0]
		}
		open[k] = bill(v, rng.IntN(n), false)
	}
	closed := make([]int, size.closedBills)
	for k := range closed {
		closed[k] = bill(anyVendor(), rng.IntN(n), false)
	}
	for range size.voidBills {
		bill(anyVendor(), rng.IntN(n), true)
	}

	partPaid := map[int]bool{}
	for _, bl := range open[:size.partPaid] {
		payment(plan[bl].vendor, later(days[bl], 30), false, apPart{doc: bl, cents: plan[bl].cents / 2})
		partPaid[bl] = true
	}

	byVendor := map[string][]int{}
	for _, bl := range closed {
		byVendor[plan[bl].vendor] = append(byVendor[plan[bl].vendor], bl)
	}
	pairsLeft := size.pairPayments
	var singles []int
	for _, v := range vendors {
		list := byVendor[v]
		for len(list) >= 2 && pairsLeft > 0 {
			x, y := list[0], list[1]
			list = list[2:]
			pairsLeft--
			payment(v, later(max(days[x], days[y]), 45), false,
				apPart{doc: x, cents: plan[x].cents}, apPart{doc: y, cents: plan[y].cents})
		}
		singles = append(singles, list...)
	}
	if pairsLeft > 0 || len(singles) < size.voidPayments {
		t.Fatalf("%s: the closed bills cannot make %d two-bill payments", size.name, size.pairPayments)
	}
	for _, bl := range singles {
		payment(plan[bl].vendor, later(days[bl], 45), false, apPart{doc: bl, cents: plan[bl].cents})
	}
	// A void payment paid part of a bill that a later payment closes: it reads
	// as never applied.
	for _, bl := range singles[:size.voidPayments] {
		payment(plan[bl].vendor, days[bl], true, apPart{doc: bl, cents: max(plan[bl].cents/3, 1)})
	}

	// Vendor credits: applied whole or in part to an open bill (never part
	// paid, so each application leaves the bill open), or refunded whole.
	applied := open[size.partPaid:]
	if len(applied) < size.fullApplied+size.partApplied {
		t.Fatalf("%s: %d open bills cannot take %d applications", size.name, len(applied), size.fullApplied+size.partApplied)
	}
	for k := range size.fullApplied + size.partApplied {
		target := applied[k]
		amount := 1000 + rng.IntN(4000)
		day := rng.IntN(n)
		credit := add(apDoc{kind: apKindCredit, vendor: plan[target].vendor, cents: amount}, day)
		part := amount
		if k >= size.fullApplied {
			part = amount / 2
		}
		add(apDoc{kind: apKindApplication, vendor: plan[target].vendor, cents: part, bill: target, credit: credit},
			later(max(day, days[target]), 30))
	}
	for range size.refunded {
		amount := 1000 + rng.IntN(4000)
		day := rng.IntN(n)
		credit := add(apDoc{kind: apKindCredit, vendor: anyVendor(), cents: amount}, day)
		add(apDoc{kind: apKindRefund, vendor: plan[credit].vendor, parts: []apPart{{doc: credit, cents: amount}}},
			later(day, 30))
	}

	for k := range size.manual {
		v := anyVendor()
		if k%10 == 9 {
			v = ""
		}
		amount := cents()
		ap := arJELine{account: b.payable.Id, credit: amount, vendor: v}
		other := arJELine{account: b.expense.Id, debit: amount}
		if rng.IntN(5) == 0 {
			ap.debit, ap.credit, other.debit, other.credit = amount, 0, 0, amount
		}
		add(apDoc{kind: apKindJournal, memo: arClip("A/P adjustment"), lines: []arJELine{ap, other}}, rng.IntN(n))
	}

	entries := 0
	for _, d := range plan {
		if d.kind == apKindApplication {
			continue
		}
		entries++
		if d.void {
			entries++
		}
	}
	rest := size.lines - 2*entries
	if rest < 0 || rest%2 != 0 {
		t.Fatalf("%s: %d entries leave %d journal lines for the other entries, want an even number of 0 or more", size.name, entries, rest)
	}
	for range rest / 2 {
		amount := cents()
		add(apDoc{kind: apKindJournal, memo: arClip("Rent"), lines: []arJELine{
			{account: b.expense.Id, debit: amount},
			{account: b.bank.Id, credit: amount},
		}}, rng.IntN(n))
	}

	// The busiest vendor and run 4's five vendors read the plan's own record
	// of the last day; the ids are not written yet, so the record is keyed by
	// plan index here.
	counts := map[string]int{}
	for _, it := range apPlanOpen(plan, b.payable.Id, data.lastDay) {
		counts[it.vendor]++
	}
	for _, v := range vendors {
		if counts[v] > counts[data.busiest] {
			data.busiest = v
		}
	}
	for _, v := range vendors[1:] {
		if len(data.picked) < 5 && counts[v] > 0 && v != data.busiest {
			data.picked = append(data.picked, v)
		}
	}
	if len(data.picked) < 5 {
		t.Fatalf("%s: fewer than five vendors have an open item", size.name)
	}
	oldest := -1
	for bl := range partPaid {
		if plan[bl].vendor == data.busiest && (oldest < 0 || days[bl] < days[oldest] || (days[bl] == days[oldest] && bl < oldest)) {
			oldest = bl
		}
	}
	if oldest < 0 {
		t.Fatalf("%s: the busiest vendor has no part-paid bill", size.name)
	}
	return plan, oldest
}

// apPlanOpen is the plan's open items on day, keyed by "<plan index>" for a
// document and "<plan index>/<position>" for a manual line.
func apPlanOpen(plan []apDoc, payable, day string) map[string]apItem {
	ids := make([]apWritten, len(plan))
	for i, d := range plan {
		ids[i] = apWritten{id: fmt.Sprint(i)}
		for pos := range d.lines {
			ids[i].lines = append(ids[i].lines, fmt.Sprintf("%d/%d", i, pos))
		}
	}
	return apRecord(plan, ids, payable, day)
}

// apRecord is the writer's record of the open items on day: a bill owes its
// total less its payment lines and applications dated on or before day, a
// vendor credit is minus its total less its applications and refund lines
// dated on or before day, and a manual Accounts payable line owes its credit
// less its debit. A void document and a void payment are none. An item that
// owes 0 is not open.
func apRecord(plan []apDoc, written []apWritten, payable, day string) map[string]apItem {
	owed := map[int]int{}
	for _, d := range plan {
		if d.void || d.date > day {
			continue
		}
		switch d.kind {
		case apKindPayment:
			for _, p := range d.parts {
				owed[p.doc] -= p.cents
			}
		case apKindRefund:
			for _, p := range d.parts {
				owed[p.doc] += p.cents
			}
		case apKindApplication:
			owed[d.bill] -= d.cents
			owed[d.credit] += d.cents
		}
	}
	out := map[string]apItem{}
	for i, d := range plan {
		if d.void || d.date > day {
			continue
		}
		switch d.kind {
		case apKindBill:
			if v := d.cents + owed[i]; v != 0 {
				out[written[i].id] = apItem{vendor: d.vendor, owed: v}
			}
		case apKindCredit:
			if v := -d.cents + owed[i]; v != 0 {
				out[written[i].id] = apItem{vendor: d.vendor, owed: v}
			}
		case apKindJournal:
			for pos, l := range d.lines {
				if l.account == payable && l.credit != l.debit {
					out[written[i].lines[pos]] = apItem{vendor: l.vendor, owed: l.credit - l.debit}
				}
			}
		}
	}
	return out
}

// apWrite writes plan with w and returns the ids it gave each document.
func apWrite(w *arWriter, plan []apDoc, b apBook) []apWritten {
	w.t.Helper()
	out := make([]apWritten, len(plan))
	for i, d := range plan {
		out[i] = apWritten{kind: d.kind}
		switch d.kind {
		case apKindBill:
			out[i].id = w.id("b")
		case apKindPayment:
			out[i].id = w.id("p")
		case apKindCredit:
			out[i].id = w.id("c")
		case apKindApplication:
			out[i].id = w.id("a")
			continue
		case apKindRefund:
			out[i].id = w.id("r")
		}
		out[i].entry = w.id("e")
		if out[i].id == "" {
			out[i].id = out[i].entry
		}
	}
	// What each bill and vendor credit has left: posting keeps a document's
	// balance, which a void payment does not move.
	used := map[int]int{}
	for _, d := range plan {
		switch {
		case d.void:
		case d.kind == apKindPayment || d.kind == apKindRefund:
			for _, p := range d.parts {
				used[p.doc] += p.cents
			}
		case d.kind == apKindApplication:
			used[d.bill] += d.cents
			used[d.credit] += d.cents
		}
	}
	for i, d := range plan {
		apWriteDoc(w, d, &out[i], out, used[i], b)
	}
	return out
}

// apWriteDoc writes one document as posting leaves it: the document row, its
// entry and lines, a payment's or refund's lines, and for a void the voided
// marks and the reversal entry with its lines. An application is its one row.
func apWriteDoc(w *arWriter, d apDoc, wr *apWritten, all []apWritten, used int, b apBook) {
	w.t.Helper()
	stamp := d.date + " 12:00:00.000Z"
	if d.kind == apKindApplication {
		w.row(apApplications, map[string]any{
			"id": wr.id, "amount": d.cents, "applied_by": d.actor, "bill": all[d.bill].id, "close_override": "",
			"created": stamp, "date": d.date, "vendor_credit": all[d.credit].id,
		})
		return
	}
	seq := w.next[d.kind]
	w.next[d.kind]++
	number := formatNumber(w.prefix[d.kind], seq)
	wr.number = number
	status, voidedAt, voidedBy := statusPosted, "", ""
	if d.void {
		status, voidedAt, voidedBy = statusVoid, stamp, d.voider
	}
	sortKey := fmt.Sprintf("%s %010d%s%s", d.date, seq, sortIDSep, wr.id)
	common := func(values map[string]any) map[string]any {
		values["id"], values["created"], values["updated"] = wr.id, stamp, stamp
		values["currency"], values["vendor"], values["date"], values["entry"] = "USD", d.vendor, d.date, wr.entry
		values["number"], values["sequence"], values["sort_key"] = number, seq, sortKey
		values["posted_at"], values["posted_by"], values["status"] = stamp, d.actor, status
		values["replaced_by"], values["replaces"], values["voided_at"], values["voided_by"] = "", "", voidedAt, voidedBy
		return values
	}
	// parts writes a payment's or refund's lines and returns their sum.
	parts := func(table, parent, docField string) int {
		sum := 0
		for pos, p := range d.parts {
			sum += p.cents
			id := w.id("q")
			wr.parts = append(wr.parts, id)
			w.row(table, map[string]any{
				"id": id, "amount": p.cents, "created": stamp, "updated": stamp,
				docField: all[p.doc].id, parent: wr.id, "position": pos,
			})
		}
		return sum
	}
	total, revision, origin, document, memo := d.cents, 1, "document", wr.id, ""
	var lines []arJELine
	switch d.kind {
	case apKindBill:
		balance := d.cents - used
		if d.void {
			balance = 0
		}
		lines = []arJELine{
			{account: b.payable.Id, credit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, debit: d.cents, vendor: d.vendor},
		}
		w.row(apBills, common(map[string]any{
			"balance": balance, "due_date": d.due, "fields": nil, "form": "", "mailing_address": nil, "memo": "",
			"ref_no": "", "revision": 3, "subtotal": d.cents, "terms": "", "total": d.cents,
		}))
	case apKindPayment:
		total = parts(apPaymentLines, "payment", "bill")
		names := make([]string, len(d.parts))
		for i, p := range d.parts {
			names[i] = "Bill " + all[p.doc].number
		}
		memo = "Payment of " + strings.Join(names, ", ")
		lines = []arJELine{
			{account: b.payable.Id, debit: total, vendor: d.vendor},
			{account: b.bank.Id, credit: total, vendor: d.vendor},
		}
		w.row(apPayments, common(map[string]any{
			"paid_from": b.bank.Id, "payment_method": "check", "reference_no": "", "total": total,
		}))
	case apKindCredit:
		balance := d.cents - used
		if d.void {
			balance = 0
		}
		lines = []arJELine{
			{account: b.payable.Id, debit: d.cents, vendor: d.vendor},
			{account: b.expense.Id, credit: d.cents, vendor: d.vendor},
		}
		w.row(apCredits, common(map[string]any{
			"balance": balance, "fields": nil, "form": "", "memo": "", "ref_no": "", "revision": 3,
			"subtotal": d.cents, "total": d.cents,
		}))
	case apKindRefund:
		total = parts(apRefundLines, "refund", "vendor_credit")
		lines = []arJELine{
			{account: b.bank.Id, debit: total, vendor: d.vendor},
			{account: b.payable.Id, credit: total, vendor: d.vendor},
		}
		w.row(apRefunds, common(map[string]any{
			"amount": total, "memo": "", "payment_method": "", "reference_no": "", "refunded_to": b.bank.Id,
		}))
	default:
		lines, origin, document, memo = d.lines, "manual", "", d.memo
		total = 0
		for _, l := range lines {
			total += l.debit
		}
		// A manual entry is saved, then each line, then it posts: each step
		// moves its revision.
		revision = 2 + len(lines)
	}
	w.entry(map[string]any{
		"id": wr.entry, "created_by": d.actor, "date": d.date, "doc_type": d.kind, "document": document,
		"memo": memo, "number": number, "origin": origin, "posted_at": stamp, "posted_by": d.actor,
		"reverses": "", "revision": revision, "sequence": seq, "status": status, "total": total,
		"created": stamp, "updated": stamp, "voided_at": voidedAt, "voided_by": voidedBy,
	})
	wr.lines = w.lines(wr.entry, d.date, stamp, lines, false)
	if !d.void {
		return
	}
	wr.reversal = w.id("e")
	w.entry(map[string]any{
		"id": wr.reversal, "created_by": d.voider, "date": d.date, "doc_type": d.kind, "document": "",
		"memo": arClip("Void of " + number), "number": number, "origin": "void_reversal", "posted_at": stamp,
		"posted_by": d.voider, "reverses": wr.entry, "revision": 1, "sequence": seq, "status": statusPosted,
		"total": total, "created": stamp, "updated": stamp, "voided_at": "", "voided_by": "",
	})
	wr.reversalLines = w.lines(wr.reversal, d.date, stamp, lines, true)
}
