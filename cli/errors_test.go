package cli

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// failWith runs a command whose body makes one GET against a server that
// answers status and body, and returns what the command printed and returned.
func failWith(t *testing.T, status int, body string, flags ...string) (string, error) {
	t.Helper()
	c := clientFor(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	root := newTestRoot(c)
	books, _, _ := root.Find([]string{"books"})
	books.AddCommand(newCommand(commandDef{Name: "probe", Output: map[string]any{"type": "object"}},
		func(cmd *cobra.Command, _ []string, _ output.Options, _ bool) error {
			return c.GetJSON(cmd.Context(), "/api/collections/books_accounts/records/x", nil)
		}))
	out, _, err := runRoot(t, root, "", append([]string{"books", "probe"}, flags...)...)
	return out, err
}

// The body PocketBase sends when a record fails validation (measured:
// server/cli_resources_test.go, TestCLIResources_RefusalShapes).
const validationBody = `{"data":{"type":{"code":"validation_required","message":"Cannot be blank."},"name":{"code":"validation_required","message":"Cannot be blank."}},"message":"Failed to create record.","status":400}`

// 401 is not in the table: the client answers a 401 with a token refresh, and
// a refused refresh is client.ErrAuthExpired (TestAuthExpiredIsExit3).
func TestExitCodeFollowsTheHTTPStatus(t *testing.T) {
	for status, want := range map[int]int{
		400: exitcode.Refused, 403: exitcode.Forbidden, 404: exitcode.NotFound,
		409: exitcode.Refused, 429: exitcode.Unavailable, 503: exitcode.Unavailable,
	} {
		_, err := failWith(t, status, `{"message":"No.","status":0,"data":{}}`)
		if got := exitcode.Of(err); got != want {
			t.Errorf("HTTP %d: exit = %d, want %d; err: %v", status, got, want, err)
		}
	}
}

func TestARefusalNamesItsFieldsInTheText(t *testing.T) {
	out, err := failWith(t, 400, validationBody)
	if err == nil {
		t.Fatal("expected an error")
	}
	want := "server error (HTTP 400): Failed to create record. (name: Cannot be blank.; type: Cannot be blank.)"
	if err.Error() != want {
		t.Errorf("error text =\n  %s\nwant\n  %s", err.Error(), want)
	}
	if out != "" {
		t.Errorf("without --json a failure prints nothing on stdout, got:\n%s", out)
	}
}

func TestJSONErrorDocument(t *testing.T) {
	out, err := failWith(t, 400, validationBody, "--json")
	if exitcode.Of(err) != exitcode.Refused {
		t.Fatalf("exit = %d, want 6", exitcode.Of(err))
	}
	var doc errorDoc
	if jsonErr := json.Unmarshal([]byte(out), &doc); jsonErr != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", jsonErr, out)
	}
	e := doc.Error
	if e.Code != "refused" || e.Exit != 6 || e.Status != 400 {
		t.Errorf("code/exit/status = %s/%d/%d, want refused/6/400", e.Code, e.Exit, e.Status)
	}
	if e.Message != "Failed to create record." {
		t.Errorf("message = %q, want the server's own message", e.Message)
	}
	if got := e.Fields["type"]; got.Code != "validation_required" || got.Message != "Cannot be blank." {
		t.Errorf("fields.type = %+v", got)
	}
	if len(e.Fields) != 2 {
		t.Errorf("fields = %+v, want name and type", e.Fields)
	}
}

// A guard refusal (server/errors.go refuse) has a message and no field.
func TestJSONErrorDocumentOfAGuardRefusal(t *testing.T) {
	out, _ := failWith(t, 400, `{"data":{},"message":"This account is used on 3 journal lines and cannot be deleted. Make it inactive instead.","status":400}`, "--json")
	var doc errorDoc
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(doc.Error.Message, "This account is used on 3 journal lines") {
		t.Errorf("message = %q", doc.Error.Message)
	}
	if strings.Contains(out, `"fields"`) {
		t.Errorf("a refusal with no field must not print a fields key:\n%s", out)
	}
}

// A proxy in front of the server answers HTML, not PocketBase JSON. The
// command must still fail in its class, with a message and no panic.
func TestANonJSONErrorBody(t *testing.T) {
	out, err := failWith(t, 502, "<html><body>Bad Gateway</body></html>", "--json")
	if got := exitcode.Of(err); got != exitcode.Unavailable {
		t.Fatalf("exit = %d, want 7", got)
	}
	var doc errorDoc
	if jsonErr := json.Unmarshal([]byte(out), &doc); jsonErr != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", jsonErr, out)
	}
	if doc.Error.Code != "unavailable" || doc.Error.Status != 502 || doc.Error.Message != "server error (HTTP 502)" {
		t.Errorf("error document = %+v", doc.Error)
	}
	if strings.Contains(out, `"fields"`) {
		t.Errorf("a body with no fields must not print a fields key:\n%s", out)
	}
}

func TestAuthExpiredIsExit3(t *testing.T) {
	c := client.New("http://127.0.0.1:1", &staticStore{}, nil)
	root := newTestRoot(c)
	books, _, _ := root.Find([]string{"books"})
	books.AddCommand(newCommand(commandDef{Name: "probe", Output: map[string]any{"type": "object"}},
		func(*cobra.Command, []string, output.Options, bool) error {
			return c.GetJSON(context.Background(), "/x", nil)
		}))
	out, _, err := runRoot(t, root, "", "books", "probe", "--json")
	if got := exitcode.Of(err); got != exitcode.Auth {
		t.Fatalf("exit = %d, want 3; err: %v", got, err)
	}
	if !strings.Contains(out, `"code": "auth"`) {
		t.Errorf("error document:\n%s", out)
	}
}

func TestReportPassesSuccessThrough(t *testing.T) {
	if err := report(&cobra.Command{}, output.Options{Format: output.JSON}, nil); err != nil {
		t.Fatalf("report(nil) = %v", err)
	}
}
