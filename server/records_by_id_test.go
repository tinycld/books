package books

import (
	"database/sql"
	"errors"
	"strings"
	"testing"
)

func TestRecordsByID_ReadsEachRowOnceAndNamesAMissingID(t *testing.T) {
	be := newBillEnv(t)
	ids := []string{be.patchCable.Id, be.accessPoint.Id, be.patchCable.Id, "missingproduct1"}
	statements := countStatements(t, be.app, func(string) bool { return true }, func() {
		got, err := recordsByID(be.app, "books_products", ids)
		if err != nil {
			t.Fatalf("recordsByID: %v", err)
		}
		if len(got) != 2 || got[be.patchCable.Id] == nil || got[be.accessPoint.Id] == nil {
			t.Fatalf("recordsByID = %d rows %v, want the patch cable and the access point", len(got), got)
		}
		if r, err := recordOf(got, be.accessPoint.Id); err != nil || r.Id != be.accessPoint.Id {
			t.Errorf("recordOf(access point) = %v, %v; want its row", r, err)
		}
		_, err = recordOf(got, "missingproduct1")
		if !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("recordOf(missing) error = %v, want sql.ErrNoRows", err)
		}
		if err == nil || !strings.Contains(err.Error(), "missingproduct1") {
			t.Errorf("recordOf(missing) error = %v, want it to name the id", err)
		}
	})
	if statements != 1 {
		t.Errorf("recordsByID of 4 ids (one twice) ran %d statements, want 1", statements)
	}
}

func TestRecordsByID_AnEmptyListRunsNoQuery(t *testing.T) {
	be := newBillEnv(t)
	statements := countStatements(t, be.app, func(string) bool { return true }, func() {
		got, err := recordsByID(be.app, "books_products", nil)
		if err != nil || got != nil {
			t.Errorf("recordsByID(nil) = %v, %v; want nil, nil", got, err)
		}
		if _, err := recordOf(got, ""); !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("recordOf of an empty map error = %v, want sql.ErrNoRows", err)
		}
	})
	if statements != 0 {
		t.Errorf("recordsByID of no ids ran %d statements, want 0", statements)
	}
}
