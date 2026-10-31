package books

import (
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/oauth"
	"tinycld.org/core/quota"
	"tinycld.org/core/search"
)

// Register wires the Books server. Core's generator calls it once from
// server/package_extensions.go; it is the only place the parts below are
// bound, so each hook and the route exist once (registrations_test.go pins
// that against the parts bound by hand).
//
// Authorization is rule-first: the collection rules (pb-migrations) decide
// who may read and write, by Books access level. The Go here adds what a rule
// cannot express: posting validation, immutability, numbering, balance rows
// and reversals. Core learns what Books provides through its registries and
// never names Books.
func Register(app *pocketbase.PocketBase) {
	registerLedger(app)
	registerAudit(app)
	oauth.RegisterPackage(oauthPackage())
	registerSearchIndex(app)
	search.RegisterSources(searchSource())
	quota.RegisterSources(quotaSources()...)
	registerOffboard()
	registerAutoReverseSweep(app)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		return e.Next()
	})
}
