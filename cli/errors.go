package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// errorDoc is the one document a failed command writes to stdout with --json,
// so an agent that parses stdout always gets JSON: the result, or this.
type errorDoc struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	// Code is the name of the exit code: usage, auth, forbidden, not_found,
	// refused, unavailable or failed.
	Code string `json:"code"`
	// Exit is the process exit code.
	Exit int `json:"exit"`
	// Message is the server's own message for a refusal, the text a person
	// would see in the app.
	Message string `json:"message"`
	// Status is the HTTP status, when the server answered.
	Status int `json:"status,omitempty"`
	// Fields holds the server's message for each field it refused.
	Fields map[string]fieldError `json:"fields,omitempty"`
}

type fieldError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// usagef is an error for a call that is wrong before anything is sent: exit 2.
func usagef(format string, a ...any) error {
	return exitcode.New(exitcode.Usage, fmt.Errorf(format, a...))
}

// report is the last step of every command. It gives err its exit code, adds
// the refused fields to the text a person reads, and with --json writes the
// error document to stdout. The shell prints "Error: …" on stderr and exits.
func report(cmd *cobra.Command, o output.Options, err error) error {
	if err == nil {
		return nil
	}
	body := bodyOf(err)
	classified := exitcode.Classify(withFields(err, body.Fields))
	if o.Format == output.JSON {
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "    ")
		if encErr := enc.Encode(errorDoc{Error: body}); encErr != nil {
			return errors.Join(classified, encErr)
		}
	}
	return classified
}

func bodyOf(err error) errorBody {
	code := exitcode.Of(exitcode.Classify(err))
	body := errorBody{Code: exitcode.Name(code), Exit: code, Message: err.Error()}
	var api *client.APIError
	if !errors.As(err, &api) {
		return body
	}
	body.Status = api.Status
	if api.Message != "" {
		body.Message = api.Message
	}
	body.Fields = refusedFields(api.Body)
	return body
}

// refusedFields reads PocketBase's field errors: {"data": {"<field>":
// {"code": "...", "message": "..."}}}. A body of another shape (a proxy's
// HTML page) has none.
func refusedFields(raw []byte) map[string]fieldError {
	var parsed struct {
		Data map[string]fieldError `json:"data"`
	}
	if json.Unmarshal(raw, &parsed) != nil || len(parsed.Data) == 0 {
		return nil
	}
	return parsed.Data
}

// fieldsError adds the refused fields to the message. "Failed to create
// record." alone does not say what to change.
type fieldsError struct {
	err    error
	fields map[string]fieldError
}

func (e *fieldsError) Unwrap() error { return e.err }

func (e *fieldsError) Error() string {
	names := make([]string, 0, len(e.fields))
	for name := range e.fields {
		names = append(names, name)
	}
	sort.Strings(names)
	parts := make([]string, len(names))
	for i, name := range names {
		parts[i] = name + ": " + e.fields[name].Message
	}
	return e.err.Error() + " (" + strings.Join(parts, "; ") + ")"
}

func withFields(err error, fields map[string]fieldError) error {
	if len(fields) == 0 {
		return err
	}
	return &fieldsError{err: err, fields: fields}
}
