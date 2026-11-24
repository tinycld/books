package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"

	"github.com/spf13/cobra"
)

// maxInputBytes bounds an --input document. The largest list record (a
// customer with two addresses and 5000 characters of notes) is far below it.
const maxInputBytes = 1 << 20

// bindInput adds the --input flag. Every command that takes a record takes it
// this way, and no other: one JSON object, from a file or from stdin.
func bindInput(cmd *cobra.Command, path *string) {
	cmd.Flags().StringVar(path, "input", "", "JSON file that holds the record, or - for standard input")
}

// readInput reads the --input document. Every failure is a usage error:
// nothing has been sent yet.
func readInput(cmd *cobra.Command, path string) (map[string]any, error) {
	if path == "" {
		return nil, usagef("--input is required: a JSON file, or - for standard input")
	}
	var src io.Reader
	if path == "-" {
		src = cmd.InOrStdin()
	} else {
		file, err := os.Open(path)
		if err != nil {
			return nil, usagef("--input: %v", err)
		}
		defer file.Close()
		src = file
	}
	data, err := io.ReadAll(io.LimitReader(src, maxInputBytes+1))
	if err != nil {
		return nil, usagef("--input: %v", err)
	}
	if len(data) > maxInputBytes {
		return nil, usagef("--input is larger than 1 MiB")
	}
	return parseObject(data)
}

// parseObject decodes one JSON object. Numbers stay json.Number, so integer
// cents are sent as written. A name given twice is refused: encoding/json
// would keep the last one and drop the other without a word.
func parseObject(data []byte) (map[string]any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	first, err := dec.Token()
	if errors.Is(err, io.EOF) {
		return nil, usagef("--input is empty")
	}
	if err != nil {
		return nil, usagef("--input is not JSON: %v", err)
	}
	if delim, ok := first.(json.Delim); !ok || delim != '{' {
		return nil, usagef("--input must be one JSON object")
	}
	out := map[string]any{}
	for dec.More() {
		keyToken, err := dec.Token()
		if err != nil {
			return nil, usagef("--input is not JSON: %v", err)
		}
		key, _ := keyToken.(string)
		if _, twice := out[key]; twice {
			return nil, usagef("--input names %q twice", key)
		}
		var value any
		if err := dec.Decode(&value); err != nil {
			return nil, usagef("--input is not JSON: %v", err)
		}
		out[key] = value
	}
	if _, err := dec.Token(); err != nil {
		return nil, usagef("--input is not JSON: %v", err)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, usagef("--input must be one JSON object, with nothing after it")
	}
	return out, nil
}
