package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// bankFileContentsCollection holds the rows Books parsed from a bank file:
// one record for each file.
const bankFileContentsCollection = "books_bank_file_contents"

// maxBankFileBytes is the `maxSize` of the `file` field of books_bank_files in
// pb-migrations. The command refuses a larger file before it sends it; a test
// of the server keeps the two numbers equal.
const maxBankFileBytes = 5242880

// defaultBankRows is how many parsed rows `banking rows` prints.
const defaultBankRows = 10

func bankFileArg() []argSpec {
	return []argSpec{{Name: "file", Help: "the id of the bank file, as `banking upload` and `banking files` print it"}}
}

func newBankingUploadCmd(c *client.Client) *cobra.Command {
	var connection, chosen string
	cmd := newCommand(commandDef{
		Name:  "upload",
		Short: "Upload a bank file (CSV, OFX, QFX or QBO) for a connection",
		Long: "Upload a statement file that you downloaded from your bank: CSV, OFX, QFX or QBO, 5 MB or less.\n" +
			"Books stores the file and reads its rows; it makes no transaction yet. `banking rows` prints\n" +
			"what Books read, and `banking import` makes the transactions.\n\n" +
			"Books refuses a file with the same content as one that is stored.",
		Args:   []argSpec{{Name: "path", Help: "the path of the file to upload"}},
		Output: recordSchema(&bankFilesResource),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if connection == "" {
			return usagef("--connection is required: an id from `%s connections`", cmd.Parent().CommandPath())
		}
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		if info, err := os.Stat(args[0]); err != nil {
			return usagef("%v", err)
		} else if info.IsDir() {
			return usagef("%s is a directory: name a file", args[0])
		} else if info.Size() > maxBankFileBytes {
			return usagef("%s is %d bytes: Books takes a bank file of 5 MB (%d bytes) or less", args[0], info.Size(), maxBankFileBytes)
		}
		id := chosenID(cmd, chosen)
		show := cmd.Parent().CommandPath() + " files"
		if err := refuseStoredID(cmd, c, bankFilesCollection, id, bankFilesResource.Singular, show); err != nil {
			return err
		}
		var raw rawRecord
		send := func() error {
			var err error
			raw, err = client.CreateRecordMultipart[rawRecord](cmd.Context(), c, bankFilesCollection,
				map[string]string{"id": id, "connection": connection},
				[]client.FilePart{{Field: "file", Name: filepath.Base(args[0]), Path: args[0]}}, nil)
			return err
		}
		stored := func() (bool, error) { return recordExists(cmd.Context(), c, bankFilesCollection, id) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return explain(err, bankFilesResource.Singular+" "+id, checkThenResend(show, id))
		}
		// A resend that an earlier send answers has no body of its own.
		if raw == nil {
			var err error
			if raw, err = client.GetRecord[rawRecord](cmd.Context(), c, bankFilesCollection, id); err != nil {
				return prefixID(&bankFilesResource, id, err)
			}
		}
		rec := project(&bankFilesResource, raw)
		o.Info(cmd.ErrOrStderr(), "uploaded %s (%s): see its rows with `%s rows %s`", rec.label(&bankFilesResource), rec.id(), cmd.Parent().CommandPath(), rec.id())
		return writeRecord(cmd, o, rec)
	})
	cmd.Flags().StringVar(&connection, "connection", "", "the connection the file is for: an id from `banking connections`")
	bindID(cmd, &chosen, "the id of the new bank file")
	return cmd
}

// bankRow is one parsed row of a bank file.
type bankRow struct {
	Line  json.Number `json:"line"`
	Cells []string    `json:"cells"`
}

// bankRowsResult is what `banking rows` prints.
type bankRowsResult struct {
	File    string    `json:"file"`
	Columns int       `json:"columns"`
	Total   int       `json:"total"`
	Rows    []bankRow `json:"rows"`
}

// bankFileRows reads the rows Books parsed from a bank file.
func bankFileRows(cmd *cobra.Command, c *client.Client, fileID string) (bankRowsResult, error) {
	type contents struct {
		Columns int       `json:"columns"`
		Rows    []bankRow `json:"rows"`
	}
	page, err := client.ListRecords[contents](cmd.Context(), c, bankFileContentsCollection, client.ListOptions{
		Filter: client.Filter("file = {:file}", map[string]any{"file": fileID}), Page: 1, PerPage: 1,
	})
	if err != nil {
		return bankRowsResult{}, err
	}
	if len(page.Items) == 0 {
		// The file may be missing, or one Books could not read.
		if _, err := fetchRecord(cmd.Context(), c, &bankFilesResource, fileID); err != nil {
			return bankRowsResult{}, err
		}
		return bankRowsResult{}, refusedf("bank file %s has no rows: Books could not read it", fileID)
	}
	rows := page.Items[0].Rows
	if rows == nil {
		rows = []bankRow{}
	}
	return bankRowsResult{File: fileID, Columns: page.Items[0].Columns, Total: len(rows), Rows: rows}, nil
}

func newBankingRowsCmd(c *client.Client) *cobra.Command {
	var limit int
	cmd := newCommand(commandDef{
		Name:  "rows",
		Short: "Print the rows Books read from a bank file",
		Long: "Print the first rows that Books read from an uploaded file, each with its line number and its cells.\n" +
			"Use it to find the columns of a CSV file for `banking import`: a column is counted from 1.\n" +
			"An OFX file always has the columns date, description, memo, amount, bank id, check number and type;\n" +
			"the line of a row is its line in the file.",
		Args: bankFileArg(),
		Output: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"file":    idSchema("the id of the bank file"),
				"columns": map[string]any{"type": "integer", "description": "the number of columns of the widest row"},
				"total":   map[string]any{"type": "integer", "description": "the number of rows of the file"},
				"rows": map[string]any{
					"type":        "array",
					"description": "the first --limit rows",
					"items": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"line":  map[string]any{"type": "integer", "description": "the line number: what `banking import` takes in `lines`"},
							"cells": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "the cells of the row, column 1 first"},
						},
						"required": []string{"line", "cells"},
					},
				},
			},
			"required": []string{"file", "columns", "total", "rows"},
		},
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if limit < 0 {
			return usagef("--limit must be 0 or more; 0 prints every row")
		}
		result, err := bankFileRows(cmd, c, args[0])
		if err != nil {
			return err
		}
		if limit > 0 && limit < len(result.Rows) {
			result.Rows = result.Rows[:limit]
			o.Info(cmd.ErrOrStderr(), "%d of %d rows shown: pass --limit 0 for all", limit, result.Total)
		}
		headers := []string{"LINE"}
		for column := 1; column <= result.Columns; column++ {
			headers = append(headers, fmt.Sprint(column))
		}
		table := make([][]string, 0, len(result.Rows))
		for _, row := range result.Rows {
			cells := make([]string, result.Columns)
			copy(cells, row.Cells)
			table = append(table, append([]string{row.Line.String()}, cells...))
		}
		return o.Write(cmd.OutOrStdout(), headers, table, result)
	})
	cmd.Flags().IntVar(&limit, "limit", defaultBankRows, "the number of rows to print; 0 prints every row")
	return cmd
}
