package books

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts. tinycld/books/lib/product-messages.ts copies them;
// tests/product-messages.test.ts fails when this wording drifts. The expense
// account's missing and inactive refusals are the shared ones of vendors.go.
const (
	msgProductDuplicateName        = "A product or service named “%s” already exists."
	msgBundleTypeFixed             = "A bundle cannot change type."
	msgBundleOnlyNew               = "Only a new product can be a bundle."
	msgIncomeAccountRequired       = "Choose an income account."
	msgIncomeAccountMissing        = "The income account does not exist."
	msgIncomeAccountInactive       = "The income account is inactive."
	msgIncomeAccountType           = "The income account must be an Income or Other income account."
	msgExpenseAccountRequired      = "Choose an expense account."
	msgProductExpenseAccountLedger = "A product's expense account cannot be Accounts receivable or Accounts payable."
	msgBundleHasNoOwn              = "A bundle has no price, cost or accounts of its own."
	msgItemNeedsBundle             = "Items belong to a bundle."
	msgItemStaysInBundle           = "An item stays in its bundle."
	msgItemProductMissing          = "The product or service does not exist."
	msgItemIsBundle                = "A bundle cannot contain another bundle."
	msgItemInactive                = "“%s” is inactive."
	msgItemQuantity                = "Enter a quantity above 0 with at most 2 decimals."
	msgBundleItemLimit             = "A bundle holds at most 50 items."
	msgProductOnOneBundle          = "This item is in 1 bundle. Take it out of it first, or make it inactive."
	msgProductOnBundles            = "This item is in %d bundles. Take it out of them first, or make it inactive."
)

// maxBundleItems is the most rows one bundle holds.
const maxBundleItems = 50

// productReference is a table whose rows name a product. A product that any
// row names cannot be deleted: message says why, given the count of distinct
// values of the distinct column among those rows.
type productReference struct {
	collection, field, distinct string
	message                     func(count int) string
}

// productReferences are the tables that hold a product. Later units (invoice,
// sales receipt, bill, expense and others) append their line tables here, so
// a product on any of those lines cannot be deleted either.
var productReferences = []productReference{
	{collection: "books_bundle_items", field: "product", distinct: "bundle", message: productOnBundlesMessage},
}

// The product and bundle row guards read other products and the accounts
// inside serialized, so no other write can commit between the check and the
// write it allows; the delete hook counts the rows that name the product the
// same way.
func registerProductGuards(app core.App) {
	bindSerializedGuard(app, "books_products", validateProduct)
	bindSerializedGuard(app, "books_bundle_items", validateBundleItem)
	app.OnRecordDelete("books_products").BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			return checkProductDelete(tx, e.Record)
		})
	})
}

// validateProduct stores the name trimmed, then checks the type change, the
// bundle's empty own columns or the item's accounts, and the name among all
// products. stored is the record before an update, nil on a create.
func validateProduct(app core.App, stored, r *core.Record) error {
	name := strings.TrimSpace(r.GetString("name"))
	r.Set("name", name)
	kind := r.GetString("type")
	if stored != nil {
		was := stored.GetString("type")
		if was == "bundle" && kind != "bundle" {
			return refuseField("type", msgBundleTypeFixed)
		}
		if was != "bundle" && kind == "bundle" {
			return refuseField("type", msgBundleOnlyNew)
		}
	}
	if err := stampCurrency(app, r); err != nil {
		return err
	}
	if kind == "bundle" {
		if bundleHasOwn(r) {
			return refuse(msgBundleHasNoOwn)
		}
	} else if err := validateProductAccounts(app, stored, r); err != nil {
		return err
	}
	// name_key belongs to the guard: it overwrites whatever the request sent.
	key := nameKey(name)
	r.Set("name_key", key)
	if stored != nil && stored.GetString("name_key") == key {
		return nil
	}
	taken, err := nameKeyTaken(app, "books_products", key, r.Id, nil)
	if err != nil {
		return fmt.Errorf("books: look up product names: %w", err)
	}
	if taken {
		return refuseField("name", msgProductDuplicateName, name)
	}
	return nil
}

// bundleHasOwn reports whether a bundle carries a column only an item has: a
// bundle's price, cost and accounts are its items'.
func bundleHasOwn(r *core.Record) bool {
	return r.GetFloat("price") != 0 ||
		r.GetFloat("cost") != 0 ||
		r.GetString("income_account") != "" ||
		r.GetString("expense_account") != "" ||
		r.GetString("purchase_description") != "" ||
		r.GetBool("purchases")
}

// validateProductAccounts checks a Service or Non-inventory item's income
// account and, while purchasing is on, its expense account. Each account is
// checked only when the write changes it, or for the expense account when the
// write turns purchasing on: a product keeps an account that became inactive
// after it was saved. While purchasing is off the purchase fields are kept and
// not checked.
func validateProductAccounts(app core.App, stored, r *core.Record) error {
	income := r.GetString("income_account")
	if income == "" {
		return refuseField("income_account", msgIncomeAccountRequired)
	}
	if stored == nil || stored.GetString("income_account") != income {
		account, err := app.FindRecordById("books_accounts", income)
		if errors.Is(err, sql.ErrNoRows) {
			return refuseField("income_account", msgIncomeAccountMissing)
		}
		if err != nil {
			return fmt.Errorf("books: read the income account: %w", err)
		}
		if account.GetBool("inactive") {
			return refuseField("income_account", msgIncomeAccountInactive)
		}
		switch account.GetString("type") {
		case "income", "other_income":
		default:
			return refuseField("income_account", msgIncomeAccountType)
		}
	}
	if !r.GetBool("purchases") {
		return nil
	}
	if r.GetString("expense_account") == "" {
		return refuseField("expense_account", msgExpenseAccountRequired)
	}
	// The account is not checked while purchasing is off, so turning purchasing
	// on checks it as if it were new, even when its id did not change.
	if stored != nil && !stored.GetBool("purchases") {
		stored = nil
	}
	return validateExpenseAccount(app, stored, r, msgProductExpenseAccountLedger)
}

// validateBundleItem checks a bundle row: its bundle is a bundle and never
// changes, its product exists, is not a bundle and is active when the row is
// created or its product changes (a bundle keeps a row whose product became
// inactive afterwards), the quantity, and the bundle's row limit. stored is
// the record before an update, nil on a create.
func validateBundleItem(app core.App, stored, r *core.Record) error {
	bundleID := r.GetString("bundle")
	if stored != nil && stored.GetString("bundle") != bundleID {
		return refuseField("bundle", msgItemStaysInBundle)
	}
	bundle, err := app.FindRecordById("books_products", bundleID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("bundle", msgItemNeedsBundle)
	}
	if err != nil {
		return fmt.Errorf("books: read the bundle: %w", err)
	}
	if bundle.GetString("type") != "bundle" {
		return refuseField("bundle", msgItemNeedsBundle)
	}
	productID := r.GetString("product")
	product, err := app.FindRecordById("books_products", productID)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("product", msgItemProductMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the bundle item's product: %w", err)
	}
	if product.GetString("type") == "bundle" {
		return refuseField("product", msgItemIsBundle)
	}
	productChanged := stored == nil || stored.GetString("product") != productID
	if product.GetBool("inactive") && productChanged {
		return refuseField("product", msgItemInactive, product.GetString("name"))
	}
	// At most 2 decimals: the tolerance absorbs float64's error on q * 100,
	// which grows with q (131072.02 * 100 is off by more than 1e-9), while a
	// real third decimal is off by 0.1 or more.
	q := r.GetFloat("quantity")
	if q <= 0 || q > 1000000 || math.Abs(q*100-math.Round(q*100)) > 1e-6 {
		return refuseField("quantity", msgItemQuantity)
	}
	if stored == nil {
		n, err := app.CountRecords("books_bundle_items", dbx.HashExp{"bundle": bundleID})
		if err != nil {
			return fmt.Errorf("books: count the bundle's items: %w", err)
		}
		if n >= maxBundleItems {
			return refuse(msgBundleItemLimit)
		}
	}
	return nil
}

// checkProductDelete refuses deleting a product that a row of any
// productReferences table names. A bundle's own rows are not references to
// it: they name it in bundle, and the cascade deletes them with it.
func checkProductDelete(app core.App, r *core.Record) error {
	for _, ref := range productReferences {
		var n int
		err := app.DB().
			Select("COUNT(DISTINCT [[" + ref.distinct + "]])").
			From(ref.collection).
			Where(dbx.HashExp{ref.field: r.Id}).
			Row(&n)
		if err != nil {
			return fmt.Errorf("books: count the %s that hold the product: %w", ref.collection, err)
		}
		if n > 0 {
			return refuse("%s", ref.message(n))
		}
	}
	return nil
}

// productOnBundlesMessage is the delete refusal for a product on count
// distinct bundles.
func productOnBundlesMessage(count int) string {
	if count == 1 {
		return msgProductOnOneBundle
	}
	return fmt.Sprintf(msgProductOnBundles, count)
}

// productTypeLabel is a product type as a person reads it; an unknown type
// has no label.
func productTypeLabel(t string) string {
	switch t {
	case "service":
		return "Service"
	case "non_inventory":
		return "Non-inventory"
	case "bundle":
		return "Bundle"
	}
	return ""
}
