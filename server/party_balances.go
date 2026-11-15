package books

import "tinycld.org/core/changesignal"

const partyBalancesView = "books_party_balances"

// The view sums posted A/R lines; a line or an account change can move any row.
func registerPartyBalances() {
	changesignal.RegisterView(partyBalancesView, "books_journal_lines", "books_accounts")
}
