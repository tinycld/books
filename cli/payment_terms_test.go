package cli

import (
	"encoding/json"
	"os"
	"testing"
)

type paymentTermCases struct {
	Terms []struct {
		Key  string `json:"key"`
		Days int    `json:"days"`
	} `json:"terms"`
	DueDates []struct {
		Name  string `json:"name"`
		Date  string `json:"date"`
		Terms string `json:"terms"`
		Due   string `json:"due"`
	} `json:"due_dates"`
}

// testdata/payment-terms.json is shared with tests/payment-terms.test.ts, which
// holds its terms equal to lib/payment-terms.ts PAYMENT_TERMS and runs its due
// dates through the bill form's vendor fill (lib/bill-values.ts billDueDate).
// This half holds paymentTermDays and dueDateFor, the hand copy that
// copy-to-bill with no --input uses, to the same file.
func loadPaymentTermCases(t *testing.T) paymentTermCases {
	t.Helper()
	data, err := os.ReadFile("testdata/payment-terms.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases paymentTermCases
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("testdata/payment-terms.json: %v", err)
	}
	return cases
}

func TestPaymentTermDaysAreTheAppTerms(t *testing.T) {
	cases := loadPaymentTermCases(t)
	if len(cases.Terms) == 0 {
		t.Fatal("testdata/payment-terms.json has no terms")
	}
	for _, term := range cases.Terms {
		days, ok := paymentTermDays[term.Key]
		if !ok {
			t.Errorf("paymentTermDays has no %s", term.Key)
			continue
		}
		if days != term.Days {
			t.Errorf("paymentTermDays[%s] = %d, want %d", term.Key, days, term.Days)
		}
	}
	if len(paymentTermDays) != len(cases.Terms) {
		t.Errorf("paymentTermDays has %d terms, and the app %d: %v", len(paymentTermDays), len(cases.Terms), paymentTermDays)
	}
}

func TestDueDateForTheSharedCases(t *testing.T) {
	cases := loadPaymentTermCases(t)
	if len(cases.DueDates) == 0 {
		t.Fatal("testdata/payment-terms.json has no due dates")
	}
	for _, tc := range cases.DueDates {
		t.Run(tc.Name, func(t *testing.T) {
			if got := dueDateFor(tc.Date, tc.Terms); got != tc.Due {
				t.Errorf("dueDateFor(%q, %q) = %q, want %q", tc.Date, tc.Terms, got, tc.Due)
			}
		})
	}
}
