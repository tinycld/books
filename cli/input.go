package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
)

// maxInputBytes bounds an --input document. The largest list record (a
// customer with two addresses and 5000 characters of notes) is far below it.
const maxInputBytes = 1 << 20

// maxInputDepth bounds how deep objects and arrays may nest in an --input
// document, the top object being level 1. A record has two or three levels; the
// limit keeps the duplicate-name walk from recursing once per bracket.
const maxInputDepth = 32

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
// cents are sent as written. A name given twice, at any depth, is refused:
// encoding/json would keep the last one and drop the other without a word.
func parseObject(data []byte) (map[string]any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
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
	if err := checkNames(dec, "", 1); err != nil {
		return nil, err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, usagef("--input must be one JSON object, with nothing after it")
	}
	// The walk proved the syntax and the names, so this decode only builds the map.
	out := map[string]any{}
	body := json.NewDecoder(bytes.NewReader(data))
	body.UseNumber()
	if err := body.Decode(&out); err != nil {
		return nil, usagef("--input is not JSON: %v", err)
	}
	return out, nil
}

// checkNames walks the members of an object whose opening brace the decoder
// has read, through the closing brace. prefix is the path of that object, so
// a refusal names "address.city" and not only "city". depth is the nesting
// level of that object, the top one being 1.
func checkNames(dec *json.Decoder, prefix string, depth int) error {
	if depth > maxInputDepth {
		return usagef("--input is nested too deeply: more than %d levels", maxInputDepth)
	}
	seen := map[string]bool{}
	for dec.More() {
		keyToken, err := dec.Token()
		if err != nil {
			return usagef("--input is not JSON: %v", err)
		}
		key, _ := keyToken.(string)
		path := prefix + key
		if seen[key] {
			return usagef("--input names %q twice", path)
		}
		seen[key] = true
		if err := checkJSONValue(dec, path, depth); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return usagef("--input is not JSON: %v", err)
	}
	return nil
}

// checkJSONValue reads one value and, for an object or an array, everything in it.
// depth is the level of the container that holds the value.
func checkJSONValue(dec *json.Decoder, path string, depth int) error {
	token, err := dec.Token()
	if err != nil {
		return usagef("--input is not JSON: %v", err)
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	if delim == '{' {
		return checkNames(dec, path+".", depth+1)
	}
	if depth+1 > maxInputDepth {
		return usagef("--input is nested too deeply: more than %d levels", maxInputDepth)
	}
	for i := 0; dec.More(); i++ {
		if err := checkJSONValue(dec, fmt.Sprintf("%s[%d]", path, i), depth+1); err != nil {
			return err
		}
	}
	if _, err := dec.Token(); err != nil {
		return usagef("--input is not JSON: %v", err)
	}
	return nil
}
