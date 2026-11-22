package books

import "slices"

// These lists must equal the select values of the migrations (form_1099_box in
// 2100000002, tax_id_type in 2100000004) and the client's BOX_1099_KEYS and
// EXPENSE_GROUP_TYPES (lib/form-1099.ts) and TAX_ID_TYPE_KEYS (lib/tax-id.ts);
// form1099_test.go fails when one drifts. The 1099 report unit reads them.

// necBox1099 is the one 1099-NEC box; every other key of boxes1099 is a
// 1099-MISC box and starts with misc1099Prefix.
const (
	necBox1099     = "nec_1"
	misc1099Prefix = "misc_"
)

var boxes1099 = []string{necBox1099, "misc_1", "misc_2", "misc_3", "misc_5", "misc_6", "misc_8", "misc_9", "misc_10", "misc_11"}

// box1099Labels is each box's label, as the client's box1099Label
// (lib/form-1099.ts) writes it: the form and box, then the box's name.
var box1099Labels = map[string]string{
	necBox1099: "NEC 1 · Nonemployee compensation",
	"misc_1":   "MISC 1 · Rents",
	"misc_2":   "MISC 2 · Royalties",
	"misc_3":   "MISC 3 · Other income",
	"misc_5":   "MISC 5 · Fishing boat proceeds",
	"misc_6":   "MISC 6 · Medical and health care payments",
	"misc_8":   "MISC 8 · Substitute payments in lieu of dividends or interest",
	"misc_9":   "MISC 9 · Crop insurance proceeds",
	"misc_10":  "MISC 10 · Gross proceeds paid to an attorney",
	"misc_11":  "MISC 11 · Fish purchased for resale",
}

var expenseGroupTypes = []string{"cost_of_goods_sold", "expense", "other_expense"}

var taxIDTypes = []string{"ein", "ssn"}

func isExpenseGroupType(t string) bool {
	return slices.Contains(expenseGroupTypes, t)
}
