package books

import (
	_ "embed"
	"encoding/json"
)

// payment_methods.json is the one list of ways a customer pays on a sales
// receipt (books_sales_receipts.payment_method holds a key; empty is none).
// The client mirrors it in tinycld/books/lib/payment-methods.ts
// (tests/payment-methods.test.ts compares the two).
//
//go:embed payment_methods.json
var paymentMethodsJSON []byte

type paymentMethod struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

var paymentMethods = mustParsePaymentMethods(paymentMethodsJSON)

func mustParsePaymentMethods(raw []byte) []paymentMethod {
	var out []paymentMethod
	if err := json.Unmarshal(raw, &out); err != nil {
		panic("books: payment_methods.json: " + err.Error())
	}
	return out
}

// paymentMethodLabel is the label of a payment method key, "" for an empty or
// unknown key.
func paymentMethodLabel(key string) string {
	for _, m := range paymentMethods {
		if m.Key == key {
			return m.Label
		}
	}
	return ""
}
