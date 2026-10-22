package books

import (
	_ "embed"
	"encoding/json"
)

// account_types.json is the one list of account and detail types. The client
// mirrors it in tinycld/books/lib/account-types.ts (tests/account-types.test.ts
// compares the two) and the migration's select values repeat its keys
// (account_types_test.go compares those).
//
//go:embed account_types.json
var accountTypesJSON []byte

type DetailType struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type AccountType struct {
	Key         string       `json:"key"`
	Label       string       `json:"label"`
	Group       string       `json:"group"`
	Normal      string       `json:"normal"`
	DetailTypes []DetailType `json:"detailTypes"`
}

var accountTypes = mustParseAccountTypes(accountTypesJSON)

func mustParseAccountTypes(raw []byte) []AccountType {
	var out []AccountType
	if err := json.Unmarshal(raw, &out); err != nil {
		panic("books: account_types.json: " + err.Error())
	}
	return out
}

func accountType(key string) (AccountType, bool) {
	for _, t := range accountTypes {
		if t.Key == key {
			return t, true
		}
	}
	return AccountType{}, false
}

func (t AccountType) hasDetail(key string) bool {
	for _, d := range t.DetailTypes {
		if d.Key == key {
			return true
		}
	}
	return false
}

func typeLabel(key string) string {
	if t, ok := accountType(key); ok {
		return t.Label
	}
	return key
}
