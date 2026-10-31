package books

import "slices"

// These lists must equal the select values of the migrations (form_1099_box in
// 2100000002, tax_id_type in 2100000004) and the client's BOX_1099_KEYS and
// EXPENSE_GROUP_TYPES (lib/form-1099.ts) and TAX_ID_TYPE_KEYS (lib/tax-id.ts);
// form1099_test.go fails when one drifts. The 1099 report unit reads them.

var boxes1099 = []string{"nec_1", "misc_1", "misc_2", "misc_3", "misc_5", "misc_6", "misc_8", "misc_9", "misc_10", "misc_11"}

var expenseGroupTypes = []string{"cost_of_goods_sold", "expense", "other_expense"}

var taxIDTypes = []string{"ein", "ssn"}

func isExpenseGroupType(t string) bool {
	return slices.Contains(expenseGroupTypes, t)
}
