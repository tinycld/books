package books

import (
	"fmt"
	"os"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// arProfileCTE finds the name of each CTE of a statement core wrote.
var arProfileCTE = regexp.MustCompile(`(?m)^(?:WITH )?(\w+) AS (?:MATERIALIZED )?\(`)

// TestARAgingProfileKeysRefusal: a key lookup that cannot find its row is an
// error the profile records, not a fatal.
func TestARAgingProfileKeysRefusal(t *testing.T) {
	b := newARBook(t)
	data := arDataset{busiest: "nobody", lastDay: arLastDay}
	if err := arOpenKeysErr(t, b, &data); err == nil {
		t.Fatal("arOpenKeysErr found a row for a customer that does not exist")
	}
}

// arProfileMissingKeys is true for a run that opens a group whose key the
// setup could not find.
func arProfileMissingKeys(r arRun) bool {
	return slices.ContainsFunc(r.opts.Expand, func(key []any) bool { return key == nil })
}

// arProfileExec runs r and returns its error. A run that passes core's time
// limit at L is a result to record, not a reason to end the profile.
func arProfileExec(t *testing.T, b arBook, r arRun) error {
	t.Helper()
	if r.export {
		_, err := exportARCSVErr(t, b, b.reader, r.params)
		return err
	}
	_, err := runARErr(t, b.app, b.reader, r.params, r.opts)
	return err
}

// arProfileStatements are the statements of r, as recordARRun reads them, for
// a run that may fail.
func arProfileStatements(t *testing.T, b arBook, r arRun) []string {
	t.Helper()
	var mu sync.Mutex
	seen := map[string]bool{}
	var out []string
	recordStatements(t, b.app, func(statement string) {
		s := strings.TrimSpace(statement)
		upper := strings.ToUpper(s)
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}, func() { _ = arProfileExec(t, b, r) })
	return out
}

// arProfileTime runs sql three times and returns the fastest time and the row
// count.
func arProfileTime(t *testing.T, b arBook, sql string) (time.Duration, int) {
	t.Helper()
	best, n := time.Duration(1<<62), 0
	for range 3 {
		started := time.Now()
		rows, err := b.app.DB().NewQuery(sql).Rows()
		if err != nil {
			t.Fatalf("profile statement: %v\n%.300s", err, sql)
		}
		n = 0
		for rows.Next() {
			n++
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
		best = min(best, time.Since(started))
	}
	return best, n
}

// arProfileFloor are reads of the two views with no report over them: the
// least a run that reads the whole book can cost.
var arProfileFloor = []string{
	"SELECT count(*), sum(debit), sum(credit), sum(length(item)), sum(length(due_date)), sum(length(item_number)), sum(item_seq) FROM books_receivable_lines",
	"SELECT count(*), sum(debit), sum(credit), sum(length(item)), sum(length(due_date)), sum(length(item_number)), sum(item_seq) FROM books_receivable_applications",
	"SELECT count(*) FROM (SELECT customer, item, sum(debit - credit) FROM books_receivable_lines GROUP BY customer, item)",
	"SELECT count(*) FROM (SELECT customer, item, sum(debit - credit) FROM (SELECT customer, item, debit, credit FROM books_receivable_lines UNION ALL SELECT customer, item, debit, credit FROM books_receivable_applications) GROUP BY customer, item)",
}

// TestARAgingProfile writes, for each run of spec §9, where its time goes: the
// run's median wall time, each statement's time, rows and plan, and the
// cumulative time of each CTE of a long statement. It starts only with
// BOOKS_PROFILE=<output file>; BOOKS_PROFILE_SIZE is small, S (default) or L.
// It has no bar: TestARAgingScale holds the bars.
func TestARAgingProfile(t *testing.T) {
	out := os.Getenv("BOOKS_PROFILE")
	if out == "" {
		t.Skip("set BOOKS_PROFILE=<output file> to profile the A/R Aging runs")
	}
	size, ok := map[string]arSize{"small": arSmall, "": arS, "S": arS, "L": arL}[os.Getenv("BOOKS_PROFILE_SIZE")]
	if !ok {
		t.Fatalf("BOOKS_PROFILE_SIZE is small, S or L")
	}
	b := newARBook(t)
	arJournalPrefix(t, b)
	data, keysErr := writeARDatasetKeys(t, b, size)
	var summary, detail strings.Builder
	fmt.Fprintf(&summary, "| run | wall (median of 5) | statements | SQL time | outside SQL |\n|---|---|---|---|---|\n")
	for _, sql := range arProfileFloor {
		d, _ := arProfileTime(t, b, sql)
		fmt.Fprintf(&detail, "FLOOR %s  %s\n", d.Round(10*time.Microsecond), sql)
	}
	for _, run := range arRuns(b, data) {
		if keysErr != nil && arProfileMissingKeys(run) {
			fmt.Fprintf(&summary, "| %s FAILED: the setup found no group key: %v | n/a | n/a | n/a | n/a |\n", run.name, keysErr)
			continue
		}
		failed := ""
		started := time.Now()
		err := arProfileExec(t, b, run)
		walls := []time.Duration{time.Since(started)}
		if err != nil {
			failed = " FAILED: " + err.Error()
		} else {
			walls = make([]time.Duration, 5)
			for i := range walls {
				started := time.Now()
				_ = arProfileExec(t, b, run)
				walls[i] = time.Since(started)
			}
			slices.Sort(walls)
		}
		// A failed run has one wall, the time to core's refusal: five more would
		// each wait out the limit again.
		wall := walls[len(walls)/2]
		statements := arProfileStatements(t, b, run)
		steps := explainStatements(t, b.app, statements)
		var sqlTime time.Duration
		fmt.Fprintf(&detail, "\n######## RUN %s: wall %s, %d statements\n", run.name, wall.Round(time.Millisecond), len(statements))
		for i, s := range statements {
			d, n := arProfileTime(t, b, s)
			sqlTime += d
			fmt.Fprintf(&detail, "\n=== run %s statement %d: %s, %d rows, %d chars\n", run.name, i, d.Round(10*time.Microsecond), n, len(s))
			for _, step := range steps {
				if step.Statement == i {
					fmt.Fprintf(&detail, "PLAN %d<-%d %s\n", step.ID, step.Parent, step.Detail)
				}
			}
			// The CTEs of a long statement, each read alone: the time up to it.
			// Not for the export, whose pages repeat run 1's statements.
			end := strings.LastIndex(s, ")\nSELECT ")
			if len(s) < 5000 || end < 0 || len(statements) > 10 {
				continue
			}
			head := s[:end+1]
			for _, m := range arProfileCTE.FindAllStringSubmatch(head, -1) {
				d, n := arProfileTime(t, b, head+"\nSELECT count(*) FROM "+m[1])
				fmt.Fprintf(&detail, "CTE %-6s cumulative %s (%d rows)\n", m[1], d.Round(10*time.Microsecond), n)
			}
		}
		// The refusal comes before the statements finish, so the wall minus the SQL
		// time of a failed run says nothing.
		outside := (wall - sqlTime).Round(time.Millisecond).String()
		if err != nil {
			outside = "n/a"
		}
		fmt.Fprintf(&summary, "| %s%s | %s | %d | %s | %s |\n", run.name, failed, wall.Round(time.Millisecond), len(statements),
			sqlTime.Round(time.Millisecond), outside)
		// Written after each run: a later run that ends the test loses nothing.
		if err := os.WriteFile(out, []byte(summary.String()+"\n"+detail.String()), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
