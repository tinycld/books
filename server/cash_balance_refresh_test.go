package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// A payment that pays many invoices rebuilds each invoice's cash-basis rows, and all
// those rows fall in the same few account-months. Each stored cash month is refreshed
// once for the whole post, not once per invoice: a refresh sums every cash row of its
// month, so refreshing per invoice makes a payment's post grow with the square of its
// invoices, and a 500-invoice payment passed the batch timeout (3s, coreserver).
func TestCashBalances_APaymentRefreshesEachMonthOnce(t *testing.T) {
	env := newPaymentEnv(t)
	const invoices = 20
	payment := env.mkPayment(t, map[string]any{"amount": 100 * invoices})
	for i := 0; i < invoices; i++ {
		mkApplication(t, env.app, payment, env.postedInvoice(t, env.customer, 100), i, 100)
	}
	writes := 0
	env.app.OnModelUpdate(cashBalancesCollection).BindFunc(func(e *core.ModelEvent) error {
		writes++
		return e.Next()
	})
	env.app.OnModelCreate(cashBalancesCollection).BindFunc(func(e *core.ModelEvent) error {
		writes++
		return e.Next()
	})
	mustPostPayment(t, env.app, payment.Id, env.users.bookkeeper.Id)
	// The post's rows fall in two accounts of one month (receivable and income), each
	// written once by the payment's own entry and once by the invoices' rebuild at most.
	if writes > 4 {
		t.Fatalf("%d cash month writes for one payment over %d invoices, want at most 4", writes, invoices)
	}
	requireNoDrift(t, env.app)
}
