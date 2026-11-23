package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// The card mark of a payment's journal entry (1099 report spec §3 "Card
// payments", §4 "New field"): the card processor reports a card payment on a
// 1099-K, so the 1099 report never counts one as reportable. Posting an
// expense, a bill payment or a vendor refund sets card_payment on its entry
// (documentPost.CardPayment); a reversal copies its target's (newReversalDraft).

// isCardPayment reports whether a payment is a card payment: its payment
// method is Credit card or Debit card, or its payment account (an expense's
// and a bill payment's Paid from, a vendor refund's Refunded to) is a credit
// card account. An account that is not found is an error, not "not a card", so
// a post that meets one writes nothing.
func isCardPayment(tx core.App, method, accountID string) (bool, error) {
	account, err := tx.FindRecordById("books_accounts", accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, fmt.Errorf("books: the payment account %q of a payment is not found", accountID)
	}
	if err != nil {
		return false, fmt.Errorf("books: read the payment account of a payment: %w", err)
	}
	if method == "credit_card" || method == "debit_card" {
		return true, nil
	}
	return account.GetString("type") == "credit_card", nil
}
