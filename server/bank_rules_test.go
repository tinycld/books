package books

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// bankRulesEnv is a migrated app with NO hooks bound, so the requests below
// measure the collection rules alone: one user per level, a connected account,
// one stored file, its parsed rows, one import of it and one transaction.
type bankRulesEnv struct {
	app                             *tests.TestApp
	users                           levelUsers
	file, contents, bankImport, txn *core.Record
}

func newBankRulesEnv(t *testing.T) *bankRulesEnv {
	t.Helper()
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	checking := saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Business Checking", "number": "1000", "type": "bank", "detail_type": "checking", "currency": "USD",
	})
	connection := saveRecord(t, app, "books_bank_connections", map[string]any{"account": checking.Id})
	file := mustSaveBankFile(t, app, connection.Id, "oct-2026.csv", sha256Hex([]byte(bankCSV)), "uploaded")
	contents := saveRecord(t, app, "books_bank_file_contents", map[string]any{
		"file": file.Id, "columns": 3,
		"rows": []map[string]any{{"line": 1, "cells": []string{"Date", "Description", "Amount"}}},
	})
	bankImport := saveRecord(t, app, "books_bank_imports", map[string]any{"file": file.Id, "lines": []int{2}})
	txn := saveRecord(t, app, "books_bank_transactions", map[string]any{
		"connection": connection.Id, "file": file.Id, "bank_import": bankImport.Id, "line": 2,
		"date": "2026-09-02", "description": "Deposit", "amount": 425000,
		"dedupe_hash": strings.Repeat("a", 64), "status": "for_review",
	})
	return &bankRulesEnv{app: app, users: users, file: file, contents: contents, bankImport: bankImport, txn: txn}
}

func collectionURL(name string) string { return "/api/collections/" + name + "/records" }

// The parsed rows and the transactions are written by the Go hooks only, and
// an import is never changed or removed once made.
func TestBankRows_OnlyTheServerWrites(t *testing.T) {
	cases := []struct {
		name   string
		method string
		url    func(env *bankRulesEnv) string
		body   func(env *bankRulesEnv) string
	}{
		{"contents create", http.MethodPost,
			func(*bankRulesEnv) string { return collectionURL("books_bank_file_contents") },
			func(env *bankRulesEnv) string { return fmt.Sprintf(`{"file":%q,"columns":1,"rows":[]}`, env.file.Id) }},
		{"contents update", http.MethodPatch,
			func(env *bankRulesEnv) string {
				return collectionURL("books_bank_file_contents") + "/" + env.contents.Id
			},
			func(*bankRulesEnv) string { return `{"columns":9}` }},
		{"contents delete", http.MethodDelete,
			func(env *bankRulesEnv) string {
				return collectionURL("books_bank_file_contents") + "/" + env.contents.Id
			},
			func(*bankRulesEnv) string { return "" }},
		{"transaction create", http.MethodPost,
			func(*bankRulesEnv) string { return collectionURL("books_bank_transactions") },
			func(env *bankRulesEnv) string {
				return fmt.Sprintf(`{"connection":%q,"file":%q,"bank_import":%q,"line":3,"date":"2026-09-05","amount":-100,"dedupe_hash":"b","status":"for_review"}`,
					env.txn.GetString("connection"), env.file.Id, env.bankImport.Id)
			}},
		{"transaction update", http.MethodPatch,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_transactions") + "/" + env.txn.Id },
			func(*bankRulesEnv) string { return `{"status":"excluded"}` }},
		{"transaction delete", http.MethodDelete,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_transactions") + "/" + env.txn.Id },
			func(*bankRulesEnv) string { return "" }},
		{"import update", http.MethodPatch,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_imports") + "/" + env.bankImport.Id },
			func(*bankRulesEnv) string { return `{"lines":[3]}` }},
		{"import delete", http.MethodDelete,
			func(env *bankRulesEnv) string { return collectionURL("books_bank_imports") + "/" + env.bankImport.Id },
			func(*bankRulesEnv) string { return "" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := newBankRulesEnv(t)
			apiReq{
				method: c.method,
				url:    c.url(env),
				token:  tokenFor(t, env.users.admin),
				body:   c.body(env),
				want:   http.StatusForbidden,
			}.run(t, env.app)
		})
	}
}

// Every Books reader reads the parsed rows, the imports and the transactions;
// a user with no Books access reads none.
func TestBankRows_ReadByBooksReaders(t *testing.T) {
	for _, name := range []string{"books_bank_file_contents", "books_bank_imports", "books_bank_transactions"} {
		for _, level := range allLevels {
			t.Run(name+"/"+string(level), func(t *testing.T) {
				env := newBankRulesEnv(t)
				want := `"totalItems":1`
				if level == LevelNone {
					want = `"totalItems":0`
				}
				apiReq{
					method:  http.MethodGet,
					url:     collectionURL(name),
					token:   tokenFor(t, env.users.byLevel(level)),
					want:    http.StatusOK,
					content: []string{want},
				}.run(t, env.app)
			})
		}
	}
}

// A writer creates an import; the counts and the importer are the server's.
func TestBankImports_CreateRule(t *testing.T) {
	body := func(env *bankRulesEnv, extra string) string {
		return fmt.Sprintf(`{"file":%q,"lines":[2]%s}`, env.file.Id, extra)
	}
	t.Run("a writer imports", func(t *testing.T) {
		env := newBankRulesEnv(t)
		apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
			token: tokenFor(t, env.users.bookkeeper), body: body(env, ""), want: http.StatusOK}.run(t, env.app)
	})
	t.Run("a reader cannot", func(t *testing.T) {
		env := newBankRulesEnv(t)
		apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
			token: tokenFor(t, env.users.readOnly), body: body(env, ""), want: http.StatusBadRequest}.run(t, env.app)
	})
	for _, field := range []string{"imported", "duplicates", "created_by"} {
		t.Run("client sends "+field, func(t *testing.T) {
			env := newBankRulesEnv(t)
			value := `3`
			if field == "created_by" {
				value = fmt.Sprintf("%q", env.users.admin.Id)
			}
			apiReq{method: http.MethodPost, url: collectionURL("books_bank_imports"),
				token: tokenFor(t, env.users.bookkeeper), body: body(env, `,"`+field+`":`+value),
				want: http.StatusBadRequest}.run(t, env.app)
		})
	}
}
