package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// The formats of `reports export`. The server writes the first three, as the
// app's Export menu does; json is the result of `reports run --all`.
const (
	exportCSV  = "csv"
	exportXLSX = "xlsx"
	exportPDF  = "pdf"
	exportJSON = "json"
)

var exportFormats = []string{exportCSV, exportXLSX, exportPDF, exportJSON}

// exportResult is what `reports export` prints with --json.
type exportResult struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Format string `json:"format"`
	File   string `json:"file"`
	Bytes  int64  `json:"bytes"`
}

var exportResultSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"id":     map[string]any{"type": "string", "description": "the id of the report"},
		"title":  map[string]any{"type": "string"},
		"format": map[string]any{"type": "string", "enum": exportFormats},
		"file":   map[string]any{"type": "string", "description": "the file that was written"},
		"bytes":  map[string]any{"type": "integer", "description": "the size of the file"},
	},
	"required": []string{"id", "title", "format", "file", "bytes"},
}

// writeFileWhole writes what fill gives to path. It opens a temporary file in
// the same directory before fill runs, and renames it after: a path that
// cannot be written is a usage error before anything is sent, and a download
// that fails leaves no half file and keeps a file that was there. An error of
// fill comes back as it is.
func writeFileWhole(path string, fill func(io.Writer) error) (int64, error) {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+"-*")
	if err != nil {
		return 0, usagef("--file: %v", err)
	}
	defer os.Remove(tmp.Name())
	if err := fill(tmp); err != nil {
		tmp.Close()
		return 0, err
	}
	size, err := tmp.Seek(0, io.SeekCurrent)
	if err == nil {
		err = tmp.Close()
	} else {
		tmp.Close()
	}
	if err == nil {
		err = os.Rename(tmp.Name(), path)
	}
	if err != nil {
		return 0, fmt.Errorf("--file: %w", err)
	}
	return size, nil
}

func newReportExportCmd(c *client.Client) *cobra.Command {
	var input, format, file string
	var hour12 bool
	cmd := newCommand(commandDef{
		Name:  "export",
		Short: "Write a report to a CSV, Excel, PDF or JSON file",
		Long: "Write a report to a file.\n\n" +
			"csv, xlsx and pdf are the files the Export menu of the app makes: every group open, with the amounts, dates and headings as people read them. " +
			"The server refuses a report of more than 50,000 rows (5,000 for pdf) and says so.\n\n" +
			"json is the result of `reports run --all`: every page, with the amounts in cents.\n\n" +
			"--input takes the params and options of `reports run`. --file is written over when it exists.",
		Args:   reportArg(),
		Input:  reportInputSchema,
		Output: exportResultSchema,
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if !slices.Contains(exportFormats, format) {
			return usagef("--format %q is not a format; use one of: csv, xlsx, pdf, json", format)
		}
		if file == "" {
			return usagef("--file is required: the file to write")
		}
		if hour12 && format == exportJSON {
			return usagef("--hour12 is for csv, xlsx and pdf: a json export holds no formatted time")
		}
		raw, err := findReport(cmd.Context(), c, args[0])
		if err != nil {
			return err
		}
		req, err := reportRunFlags{input: input}.request(cmd, raw)
		if err != nil {
			return err
		}
		size, err := writeFileWhole(file, func(w io.Writer) error {
			if format == exportJSON {
				res, err := runWholeReport(cmd.Context(), c, req, "")
				if err != nil {
					return err
				}
				enc := json.NewEncoder(w)
				enc.SetIndent("", "    ")
				return enc.Encode(res)
			}
			body := req.body("")
			body["format"] = format
			if hour12 {
				body["hour12"] = true
			}
			stream, _, err := c.PostStream(cmd.Context(), reportExportPath, body)
			if err != nil {
				return err
			}
			defer stream.Close()
			if _, err := io.Copy(w, stream); err != nil {
				return fmt.Errorf("the download of the report stopped: %w", err)
			}
			return nil
		})
		if err != nil {
			return err
		}
		res := exportResult{ID: req.id, Title: req.title, Format: format, File: file, Bytes: size}
		return o.Write(cmd.OutOrStdout(), []string{"FILE", "FORMAT", "BYTES"}, [][]string{{file, format, fmt.Sprint(size)}}, res)
	})
	bindReportInput(cmd, &input)
	cmd.Flags().StringVar(&format, "format", exportCSV, "the file format: csv, xlsx, pdf or json")
	cmd.Flags().StringVar(&file, "file", "", "the file to write")
	cmd.Flags().BoolVar(&hour12, "hour12", false, "print times with am and pm (csv, xlsx, pdf)")
	return cmd
}
