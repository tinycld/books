package books

import (
	"errors"
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

func TestAllocateNumber_UnknownTypeFails(t *testing.T) {
	app := newBooksApp(t)
	err := app.RunInTransaction(func(tx core.App) error {
		_, _, err := allocateNumber(tx, "invoice")
		return err
	})
	if err == nil {
		t.Fatal("an unknown document type got a number")
	}
}
