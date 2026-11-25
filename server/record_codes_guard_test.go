package books

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func storedCode(t *testing.T, app core.App, collection, id string) string {
	t.Helper()
	return reload(t, app, collection, id).GetString("code")
}

func TestRecordCode_GeneratedOnCreate(t *testing.T) {
	app := newGuardedApp(t)
	a := mkCustomer(t, app, "Aspen Ridge Dental", "")
	b := mkCustomer(t, app, "Acme Rental Depot", "")
	if got := storedCode(t, app, "books_customers", a.Id); got != "ARD" {
		t.Fatalf("first code = %q, want ARD", got)
	}
	if got := storedCode(t, app, "books_customers", b.Id); got != "ARD-2" {
		t.Fatalf("second code = %q, want ARD-2", got)
	}
}

func TestRecordCode_SubCustomerSharesTheNamespace(t *testing.T) {
	app := newGuardedApp(t)
	parent := mkCustomer(t, app, "Aspen Ridge Dental", "")
	sub := mkCustomer(t, app, "Acme Rental Depot", parent.Id)
	if got := storedCode(t, app, "books_customers", sub.Id); got != "ARD-2" {
		t.Fatalf("sub-customer code = %q, want ARD-2", got)
	}
}

func TestRecordCode_BaseWhenTheNameGivesNone(t *testing.T) {
	app := newGuardedApp(t)
	a := mkCustomer(t, app, "李明", "")
	b := mkCustomer(t, app, "X", "")
	if got := storedCode(t, app, "books_customers", a.Id); got != "CUST" {
		t.Fatalf("code = %q, want CUST", got)
	}
	if got := storedCode(t, app, "books_customers", b.Id); got != "CUST-2" {
		t.Fatalf("code = %q, want CUST-2", got)
	}
	v := mkVendor(t, app, "李明")
	if got := storedCode(t, app, "books_vendors", v.Id); got != "VEND" {
		t.Fatalf("vendor code = %q, want VEND", got)
	}
}

func TestRecordCode_ANameThatGivesNewTakesTheBase(t *testing.T) {
	app := newGuardedApp(t)
	c := mkCustomer(t, app, "New", "")
	if got := storedCode(t, app, "books_customers", c.Id); got != "CUST" {
		t.Fatalf("code = %q, want CUST", got)
	}
}

func TestRecordCode_SentCodeIsTrimmedAndUppercased(t *testing.T) {
	app := newGuardedApp(t)
	r, err := newCustomer(app, map[string]any{"display_name": "Aspen", "code": "  asp-1 "})
	if err != nil {
		t.Fatal(err)
	}
	if got := storedCode(t, app, "books_customers", r.Id); got != "ASP-1" {
		t.Fatalf("code = %q, want ASP-1", got)
	}
}

func TestRecordCode_ShapeIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	for _, bad := range []string{"A", "-AB", "A B", "VERYLONGSINGLEWX", "A_B"} {
		_, err := newCustomer(app, map[string]any{"display_name": "Aspen " + bad, "code": bad})
		requireFieldRefusal(t, err, "code", msgCodeShape)
	}
}

func TestRecordCode_NewIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	_, err := newCustomer(app, map[string]any{"display_name": "Newton", "code": "new"})
	requireFieldRefusal(t, err, "code", msgCodeReserved)
}

func TestRecordCode_TakenIsRefused(t *testing.T) {
	app := newGuardedApp(t)
	mkCustomer(t, app, "Aspen Ridge Dental", "")
	_, err := newCustomer(app, map[string]any{"display_name": "Other", "code": "ard"})
	requireFieldRefusal(t, err, "code", "Another customer has the code ARD.")
}

func TestRecordCode_SameCodeInTwoCollections(t *testing.T) {
	app := newGuardedApp(t)
	c := mkCustomer(t, app, "Aspen Ridge Dental", "")
	v := mkVendor(t, app, "Aspen Ridge Dental")
	if storedCode(t, app, "books_customers", c.Id) != "ARD" || storedCode(t, app, "books_vendors", v.Id) != "ARD" {
		t.Fatal("a customer and a vendor may share a code")
	}
}

func TestRecordCode_UpdateKeepsItsOwnCode(t *testing.T) {
	app := newGuardedApp(t)
	c := mkCustomer(t, app, "Aspen Ridge Dental", "")
	if err := setFields(t, app, "books_customers", c.Id, map[string]any{"notes": "x"}); err != nil {
		t.Fatalf("an update that keeps the code must pass: %v", err)
	}
	if err := setFields(t, app, "books_customers", c.Id, map[string]any{"code": "ard"}); err != nil {
		t.Fatalf("re-sending its own code in lowercase must pass: %v", err)
	}
}

func TestRecordCode_UpdateWithEmptyCodeRegenerates(t *testing.T) {
	app := newGuardedApp(t)
	c := mkCustomer(t, app, "Aspen Ridge Dental", "")
	if err := setFields(t, app, "books_customers", c.Id, map[string]any{"code": "", "display_name": "Bright Smile"}); err != nil {
		t.Fatal(err)
	}
	if got := storedCode(t, app, "books_customers", c.Id); got != "BS" {
		t.Fatalf("code = %q, want BS", got)
	}
}

func TestRecordCode_EditToAnotherCode(t *testing.T) {
	app := newGuardedApp(t)
	c := mkCustomer(t, app, "Aspen Ridge Dental", "")
	if err := setFields(t, app, "books_customers", c.Id, map[string]any{"code": "ASPEN"}); err != nil {
		t.Fatal(err)
	}
	if got := storedCode(t, app, "books_customers", c.Id); got != "ASPEN" {
		t.Fatalf("code = %q, want ASPEN", got)
	}
}

func TestRecordCode_ProductGetsItemBase(t *testing.T) {
	app := newGuardedApp(t)
	p := mkService(t, app, "X", mkIncomeAccount(t, app))
	if got := storedCode(t, app, "books_products", p.Id); got != "ITEM" {
		t.Fatalf("product code = %q, want ITEM", got)
	}
}

func TestRecordCode_LongBaseSuffixesStayUnique(t *testing.T) {
	app := newGuardedApp(t)
	var codes []string
	for i := 0; i < 3; i++ {
		c := mkCustomer(t, app, fmt.Sprintf("Verylongsinglewordname%c", 'a'+i), "")
		codes = append(codes, storedCode(t, app, "books_customers", c.Id))
	}
	want := []string{"VERYLONGSINGLEW", "VERYLONGSINGL-2", "VERYLONGSINGL-3"}
	if !reflect.DeepEqual(codes, want) {
		t.Fatalf("codes = %v, want %v", codes, want)
	}
}
