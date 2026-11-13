package books

import (
	"errors"
	"slices"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func allocate(t testing.TB, app core.App) (int, string) {
	t.Helper()
	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "journal")
		return err
	})
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}
	return seq, number
}

func TestAllocateNumber_ConcurrentCallersGetDistinctContiguousNumbers(t *testing.T) {
	app := newBooksApp(t)
	const n = 20
	got := make(chan int, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := app.RunInTransaction(func(tx core.App) error {
				seq, _, err := allocateNumber(tx, "journal")
				if err == nil {
					got <- seq
				}
				return err
			})
			if err != nil {
				t.Errorf("allocate: %v", err)
			}
		}()
	}
	wg.Wait()
	close(got)
	seen := map[int]bool{}
	for seq := range got {
		if seen[seq] {
			t.Errorf("number %d issued twice", seq)
		}
		seen[seq] = true
	}
	for i := 1; i <= n; i++ {
		if !seen[i] {
			t.Errorf("number %d skipped", i)
		}
	}
}

func TestAllocateNumber_RolledBackPostConsumesNoNumber(t *testing.T) {
	app := newBooksApp(t)
	refused := errors.New("refused")
	err := app.RunInTransaction(func(tx core.App) error {
		if _, _, err := allocateNumber(tx, "journal"); err != nil {
			return err
		}
		return refused
	})
	if !errors.Is(err, refused) {
		t.Fatalf("err = %v", err)
	}
	if seq, _ := allocate(t, app); seq != 1 {
		t.Fatalf("after a rollback the next number is %d, want 1", seq)
	}
}

func TestAllocateNumber_UsesThePrefixAndStart(t *testing.T) {
	app := newBooksApp(t)
	seqRow := reload(t, app, "books_doc_sequences", "booksseqjournal")
	seqRow.Set("prefix", "JE-")
	seqRow.Set("next_number", 41)
	if err := app.Save(seqRow); err != nil {
		t.Fatal(err)
	}
	if seq, number := allocate(t, app); seq != 41 || number != "JE-41" {
		t.Fatalf("got %d %q, want 41 JE-41", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 42 {
		t.Fatalf("next_number = %d, want 42", next)
	}
}

func TestAllocateNumber_TransferSequenceStartsAtTR1(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqtransfr")
	if got := row.GetString("doc_type"); got != "transfer" {
		t.Fatalf("doc_type = %q, want transfer", got)
	}
	if got := row.GetString("prefix"); got != "TR-" {
		t.Fatalf("prefix = %q, want TR-", got)
	}
	if got := row.GetInt("next_number"); got != 1 {
		t.Fatalf("next_number = %d, want 1", got)
	}

	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "transfer")
		return err
	})
	if err != nil {
		t.Fatalf("allocate a transfer number: %v", err)
	}
	if seq != 1 || number != "TR-1" {
		t.Fatalf("got %d %q, want 1 TR-1", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqtransfr").GetInt("next_number"); next != 2 {
		t.Fatalf("transfer next_number = %d, want 2", next)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 1 {
		t.Fatalf("journal next_number = %d, want 1 (a transfer must not take a journal number)", next)
	}
}

func TestAllocateNumber_InvoiceSequenceStartsAt1001(t *testing.T) {
	app := newBooksApp(t)
	row := reload(t, app, "books_doc_sequences", "booksseqinvoice")
	if got := row.GetString("doc_type"); got != "invoice" {
		t.Fatalf("doc_type = %q, want invoice", got)
	}
	if got := row.GetString("prefix"); got != "" {
		t.Fatalf("prefix = %q, want none", got)
	}
	if got := row.GetInt("next_number"); got != 1001 {
		t.Fatalf("next_number = %d, want 1001", got)
	}

	var seq int
	var number string
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		seq, number, err = allocateNumber(tx, "invoice")
		return err
	})
	if err != nil {
		t.Fatalf("allocate an invoice number: %v", err)
	}
	if seq != 1001 || number != "1001" {
		t.Fatalf("got %d %q, want 1001 \"1001\"", seq, number)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqinvoice").GetInt("next_number"); next != 1002 {
		t.Fatalf("invoice next_number = %d, want 1002", next)
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 1 {
		t.Fatalf("journal next_number = %d, want 1 (an invoice must not take a journal number)", next)
	}
}

func TestJournalEntryOrigin_HasDocument(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_journal_entries")
	if err != nil {
		t.Fatal(err)
	}
	field, ok := col.Fields.GetByName("origin").(*core.SelectField)
	if !ok {
		t.Fatal("books_journal_entries.origin is not a select field")
	}
	if !slices.Contains(field.Values, "document") {
		t.Fatalf("origin values = %v, want document among them", field.Values)
	}
}

func TestDocTypes_MatchTheMigrations(t *testing.T) {
	app := newBooksApp(t)
	want := []string{"journal", "transfer", "invoice", "sales_receipt"}
	for _, name := range []string{"books_journal_entries", "books_doc_sequences"} {
		col, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatalf("find %s: %v", name, err)
		}
		field, ok := col.Fields.GetByName("doc_type").(*core.SelectField)
		if !ok {
			t.Fatalf("%s.doc_type is not a select field", name)
		}
		if !slices.Equal(field.Values, want) {
			t.Fatalf("%s.doc_type values = %v, want %v", name, field.Values, want)
		}
	}
}

func TestAllocateNumber_UnknownTypeFails(t *testing.T) {
	app := newBooksApp(t)
	err := app.RunInTransaction(func(tx core.App) error {
		_, _, err := allocateNumber(tx, "bill")
		return err
	})
	if err == nil {
		t.Fatal("an unknown document type got a number")
	}
}
