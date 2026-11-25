package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
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
// fill comes back as it is. A path that is a link is written through, so the
// link stays; a file that was there keeps its mode, and a new file gets the
// mode of an ordinary write (0666 less the umask).
func writeFileWhole(path string, fill func(io.Writer) error) (int64, error) {
	if info, err := os.Lstat(path); err == nil && info.Mode()&os.ModeSymlink != 0 {
		if path, err = filepath.EvalSymlinks(path); err != nil {
			return 0, usagef("--file: %v", err)
		}
	}
	mode, created, err := targetMode(path)
	if err != nil {
		return 0, err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+"-*")
	if err != nil {
		if created {
			os.Remove(path)
		}
		return 0, usagef("--file: %v", err)
	}
	defer os.Remove(tmp.Name())
	// The empty file that gave the mode of a new file goes with a failure: the
	// rename replaces it on success.
	failed := true
	defer func() {
		if created && failed {
			os.Remove(path)
		}
	}()
	if err := fill(tmp); err != nil {
		tmp.Close()
		return 0, err
	}
	size, err := tmp.Seek(0, io.SeekCurrent)
	if err == nil {
		err = tmp.Chmod(mode)
	}
	if err == nil {
		err = tmp.Close()
	} else {
		tmp.Close()
	}
	if err == nil {
		err = os.Rename(tmp.Name(), path)
	}
	failed = err != nil
	if err != nil {
		return 0, fmt.Errorf("--file: %w", err)
	}
	return size, nil
}

// targetMode is the mode the written file gets. A file that is there keeps its
// own; a directory is no file to write. For a new path it makes an empty file,
// so the process umask decides the mode as it does for any ordinary write;
// created says the caller must remove that file when the write fails.
func targetMode(path string) (mode os.FileMode, created bool, err error) {
	info, err := os.Stat(path)
	if err == nil {
		if info.IsDir() {
			return 0, false, usagef("--file: %s is a directory", path)
		}
		return info.Mode().Perm(), false, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return 0, false, usagef("--file: %v", err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o666)
	if err != nil {
		return 0, false, usagef("--file: %v", err)
	}
	defer f.Close()
	info, err = f.Stat()
	if err != nil {
		os.Remove(path)
		return 0, false, usagef("--file: %v", err)
	}
	return info.Mode().Perm(), true, nil
}

// readFailure marks an error of the download itself, to tell it from an error
// of the write to the file.
type readFailure struct{ r io.Reader }

func (f readFailure) Read(p []byte) (int, error) {
	n, err := f.r.Read(p)
	if err != nil && err != io.EOF {
		err = exitcode.New(exitcode.Unavailable, err)
	}
	return n, err
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
			if _, err := io.Copy(w, readFailure{stream}); err != nil {
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
