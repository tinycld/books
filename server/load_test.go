package books

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
)

// Phase 1 exit check: with tens of thousands of posted lines, the reads the
// client makes stay bounded and the balance rows stay one per account-month.
const (
	loadEntries    = 15000
	loadPageSize   = 50
	loadReadBudget = 500 * time.Millisecond
)

func TestLoad_TensOfThousandsOfPostedLines(t *testing.T) {
	if testing.Short() {
		t.Skip("load check seeds 30,000 posted lines")
	}
	env := newLedgerEnv(t)
	for i := 0; i < loadEntries; i++ {
		date := time.Date(2026, time.Month(i%12+1), i%28+1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		mustPost(t, env.app, env.sale(t, date, 100+i%900).Id, env.users.bookkeeper.Id)
	}
	requireNoDrift(t, env.app)

	var lines int
	if err := env.app.DB().NewQuery("SELECT COUNT(*) FROM books_journal_lines WHERE posted = 1").Row(&lines); err != nil {
		t.Fatal(err)
	}
	if lines < 2*loadEntries {
		t.Fatalf("posted lines = %d, want at least %d", lines, 2*loadEntries)
	}

	var balanceRows int
	if err := env.app.DB().NewQuery("SELECT COUNT(*) FROM books_account_balances").Row(&balanceRows); err != nil {
		t.Fatal(err)
	}
	if balanceRows > 2*12 {
		t.Errorf("balance rows = %d, want one per account-month (at most 24)", balanceRows)
	}

	// The register read: one account, one month, one page, as pbtsdb asks for it.
	started := time.Now()
	page, err := env.app.FindRecordsByFilter("books_journal_lines",
		"account = {:a} && date >= '2026-05-01' && date <= '2026-05-31'", "-date", loadPageSize, 0,
		dbx.Params{"a": env.checking.Id})
	if err != nil || len(page) != loadPageSize {
		t.Fatalf("register page: %d rows, err %v", len(page), err)
	}
	if took := time.Since(started); took > loadReadBudget {
		t.Errorf("register page took %s, budget %s", took, loadReadBudget)
	}

	// A balance read touches the balance rows, never the lines.
	started = time.Now()
	rows, err := env.app.FindAllRecords("books_account_balances")
	if err != nil || len(rows) != balanceRows {
		t.Fatalf("balances read: %d rows, err %v", len(rows), err)
	}
	if took := time.Since(started); took > loadReadBudget {
		t.Errorf("balances read took %s, budget %s", took, loadReadBudget)
	}

	// A post after the load costs the same as one before it.
	started = time.Now()
	mustPost(t, env.app, env.sale(t, "2026-12-31", 100).Id, env.users.bookkeeper.Id)
	if took := time.Since(started); took > loadReadBudget {
		t.Errorf("post under load took %s, budget %s", took, loadReadBudget)
	}
}
