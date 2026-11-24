package cli

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/output"
)

// account_types.json is a copy of server/account_types.json, the one list of
// account types and their detail types. This module cannot embed a file of
// another directory tree, so the copy is held equal by
// server/cli_resources_test.go (TestCLIResources_AccountTypesAreTheServers).
//
//go:embed account_types.json
var accountTypesJSON []byte

type accountType struct {
	Key         string       `json:"key"`
	Label       string       `json:"label"`
	Group       string       `json:"group"`
	Normal      string       `json:"normal"`
	DetailTypes []detailType `json:"detailTypes"`
}

type detailType struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

func loadAccountTypes() ([]accountType, error) {
	var types []accountType
	err := json.Unmarshal(accountTypesJSON, &types)
	return types, err
}

// newAccountTypesCmd prints the values `type` and `detail_type` of an account
// may have. It reads no server: the list ships with the CLI.
func newAccountTypesCmd() *cobra.Command {
	keyAndLabel := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"key":   map[string]any{"type": "string", "description": "the value to send"},
			"label": map[string]any{"type": "string", "description": "the name the app shows"},
		},
		"required": []string{"key", "label"},
	}
	return newCommand(commandDef{
		Name:  "types",
		Short: "List the account types and the detail types of each",
		Long: "List the values an account's `type` may have, and for each type the\n" +
			"values its `detail_type` may have.",
		Output: map[string]any{
			"type": "array",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"key":         map[string]any{"type": "string", "description": "the value of an account's `type`"},
					"label":       map[string]any{"type": "string", "description": "the name the app shows"},
					"group":       map[string]any{"type": "string", "description": "asset, liability, equity, income or expense"},
					"normal":      map[string]any{"type": "string", "description": "the normal balance: debit or credit"},
					"detailTypes": map[string]any{"type": "array", "items": keyAndLabel, "description": "the values of `detail_type` for this type"},
				},
				"required": []string{"key", "label", "group", "normal", "detailTypes"},
			},
		},
	}, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		types, err := loadAccountTypes()
		if err != nil {
			return err
		}
		rows := make([][]string, len(types))
		for i, t := range types {
			details := make([]string, len(t.DetailTypes))
			for j, d := range t.DetailTypes {
				details[j] = d.Key
			}
			rows[i] = []string{t.Key, t.Label, t.Normal, strings.Join(details, " ")}
		}
		return o.Write(cmd.OutOrStdout(), []string{"TYPE", "LABEL", "NORMAL", "DETAIL TYPES"}, rows, types)
	})
}
