package books

import (
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/forms"
)

// generatedHostsPath is the forms hosts file the generator writes from every
// package's forms/hosts.ts (pnpm install or `pnpm run packages:generate`
// in the tinycld repo). The server binds it at boot; the tests bind the same
// file, so the line rules come from the real books:invoice host, never a copy.
var generatedHostsPath = filepath.Join("..", "..", "tinycld", "server", "form_hosts.json")

// bindInvoiceHost binds the generated books:invoice forms host on app, as the
// server does at boot, so the invoice line guard reads its row kinds.
func bindInvoiceHost(t *testing.T, app core.App) {
	t.Helper()
	defs, err := forms.LoadHosts(generatedHostsPath)
	if err != nil {
		t.Fatalf("load the generated forms hosts: %v", err)
	}
	host := defs.Host(invoiceHostKey)
	if host == nil {
		t.Fatalf("%s has no %s host: run `pnpm run packages:generate` in the tinycld repo", generatedHostsPath, invoiceHostKey)
	}
	forms.BindHooks(app, &forms.Defs{Hosts: []forms.Host{*host}})
}

// bindEstimateHost binds the generated books:estimate forms host on app, as the
// server does at boot, so the estimate line guard reads its row kinds.
func bindEstimateHost(t *testing.T, app core.App) {
	t.Helper()
	defs, err := forms.LoadHosts(generatedHostsPath)
	if err != nil {
		t.Fatalf("load the generated forms hosts: %v", err)
	}
	host := defs.Host(estimateKind.HostKey)
	if host == nil {
		t.Fatalf("%s has no %s host: run `pnpm run packages:generate` in the tinycld repo", generatedHostsPath, estimateKind.HostKey)
	}
	forms.BindHooks(app, &forms.Defs{Hosts: []forms.Host{*host}})
}
