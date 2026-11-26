package books

import (
	"fmt"
	"testing"
)

// A statement through the writes of its commands: `add` is one create with no
// id (a list resource), there is no change, and `delete` removes it. The
// bodies are those of the statements case of cli/resources_test.go.
func TestCLIResources_StatementRoundTrip(t *testing.T) {
	env := newStatementEnv(t)
	token := tokenFor(t, env.users.bookkeeper)
	env.postedInvoice(t, env.customer, 30000)
	const statements = "/api/collections/books_statements/records"
	add := func(body string, want int, content ...string) apiReq {
		return apiReq{method: "POST", url: statements, token: token, body: body, want: want, content: content}
	}
	apiSeq(t, env.app,
		add(fmt.Sprintf(`{"customer":%q,"end_date":"2026-11-20","start_date":"2026-11-01","statement_date":"2026-11-20","type":"balance_forward"}`, env.customer.Id), 200,
			`"number":"ST-1001"`, `"balance":30000`, `"currency":"USD"`, `"sent_to":""`),
		add(fmt.Sprintf(`{"customer":%q,"statement_date":"2026-11-20","type":"open_items"}`, env.customer.Id), 200, `"number":"ST-1002"`, `"balance":30000`),
		// What Books refuses, with the field it names.
		add(fmt.Sprintf(`{"customer":%q,"statement_date":"2026-11-20","type":"balance_forward"}`, env.customer.Id), 400, `"start_date":{"code":"validation_books"`),
		add(fmt.Sprintf(`{"customer":%q,"end_date":"2026-11-20","start_date":"2026-11-01","statement_date":"2026-11-20","type":"open_items"}`, env.customer.Id), 400,
			"An open items statement has no period."),
		add(fmt.Sprintf(`{"balance":5,"customer":%q,"statement_date":"2026-11-20","type":"open_items"}`, env.customer.Id), 400, "Books sets these fields itself: balance."),
		// list, as the fixture of cli/testdata/list-filters.json filters and sorts it.
		apiReq{method: "GET", url: statements + fmt.Sprintf("?filter=customer%%3D%%22%s%%22%%26%%26type%%3D%%22open_items%%22&sort=-statement_date,-created,id", env.customer.Id),
			token: token, want: 200, content: []string{`"totalItems":1`, `"number":"ST-1002"`}},
	)
	rows, err := env.app.FindAllRecords("books_statements")
	if err != nil || len(rows) != 2 {
		t.Fatalf("the statements: %d, %v", len(rows), err)
	}
	id := rows[0].Id
	apiSeq(t, env.app,
		// A statement is never changed: the group has no `edit`.
		apiReq{method: "PATCH", url: statements + "/" + id, token: token, want: 403, body: `{"statement_date":"2026-11-21"}`},
		apiReq{method: "DELETE", url: statements + "/" + id, token: token, want: 204},
		apiReq{method: "GET", url: statements + "/" + id, token: token, want: 404},
	)
}
