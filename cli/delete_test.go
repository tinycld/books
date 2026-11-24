package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"golang.org/x/term"

	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

func TestDeactivateAndActivate(t *testing.T) {
	f := chart(t)
	c := f.serve()
	out, errOut, err := runCmd(t, c, "", "books", "accounts", "deactivate", "acctsavings0001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if sent, _ := json.Marshal(f.lastPatch); string(sent) != `{"inactive":true}` {
		t.Errorf("deactivate sent %s", sent)
	}
	if decodeRecord(t, out)["inactive"] != true || !strings.Contains(errOut, "deactivated account Savings") {
		t.Errorf("stdout:\n%s\nstderr: %q", out, errOut)
	}
	if _, _, err := runCmd(t, c, "", "books", "accounts", "activate", "acctsavings0001"); err != nil {
		t.Fatal(err)
	}
	if sent, _ := json.Marshal(f.lastPatch); string(sent) != `{"inactive":false}` {
		t.Errorf("activate sent %s", sent)
	}
	_, _, err = runCmd(t, c, "", "books", "accounts", "deactivate", "nope")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("deactivate of a missing account: exit = %d, want 5", got)
	}
}

// The server refuses to make an account inactive while it has active
// sub-accounts. The CLI passes the server's own sentence on.
func TestDeactivateRefusalShowsTheServerMessage(t *testing.T) {
	f := chart(t)
	f.refuse("PATCH", 400, `{"data":{},"message":"Make the 2 active sub-accounts inactive first.","status":400}`)
	_, _, err := runCmd(t, f.serve(), "", "books", "accounts", "deactivate", "acctchecking001")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want 6", got)
	}
	want := "account acctchecking001: server error (HTTP 400): Make the 2 active sub-accounts inactive first."
	if err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
}

func TestDeleteWithYes(t *testing.T) {
	f := chart(t)
	out, errOut, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctsavings0001", "--yes", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(f.deleted) != "[acctsavings0001]" {
		t.Errorf("deleted = %v", f.deleted)
	}
	got := decodeRecord(t, out)
	if got["id"] != "acctsavings0001" || got["deleted"] != true {
		t.Errorf("result = %v", got)
	}
	if !strings.Contains(errOut, "deleted account Savings (acctsavings0001)") {
		t.Errorf("stderr = %q", errOut)
	}
}

// Without --yes and without a terminal a delete refuses as a usage error
// and says to pass --yes. It uses the real ui.Confirm.
func TestDeleteWithoutYesDeletesNothing(t *testing.T) {
	if term.IsTerminal(int(os.Stdin.Fd())) {
		t.Skip("stdin is a terminal: the no-terminal refusal cannot be reached")
	}
	f := chart(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctsavings0001")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if err == nil || err.Error() != "refusing to prompt without a terminal; pass --yes to delete" {
		t.Errorf("error = %v, want delete's own no-terminal message", err)
	}
	if len(f.deleted) != 0 {
		t.Errorf("deleted without --yes: %v", f.deleted)
	}
}

// The terminal check comes before any request: its message says nothing was
// sent, and a wrong id is a usage error here, not exit 5.
func TestDeleteWithoutYesAndTerminalSendsNothing(t *testing.T) {
	orig := canPrompt
	canPrompt = func(output.Options) bool { return false }
	t.Cleanup(func() { canPrompt = orig })
	f := chart(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "nope")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("requests = %v, want none", f.requests)
	}
}

// stubConfirm replaces the prompt, which core reads from the real stdin.
func stubConfirm(t *testing.T, answer bool, readErr error) {
	t.Helper()
	orig := confirm
	confirm = func(output.Options, bool, io.Reader, io.Writer, string) (bool, error) {
		return answer, readErr
	}
	origCan := canPrompt
	canPrompt = func(output.Options) bool { return true }
	t.Cleanup(func() { confirm = orig; canPrompt = origCan })
}

func TestDeleteAnsweredNoDeletesNothing(t *testing.T) {
	stubConfirm(t, false, nil)
	f := chart(t)
	out, errOut, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctsavings0001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	got := decodeRecord(t, out)
	if got["id"] != "acctsavings0001" || got["deleted"] != false {
		t.Errorf("result = %v", got)
	}
	if !strings.Contains(errOut, "not deleted") {
		t.Errorf("stderr = %q", errOut)
	}
	if len(f.deleted) != 0 {
		t.Errorf("deleted after a no: %v", f.deleted)
	}
}

func TestDeleteAnsweredYesDeletes(t *testing.T) {
	stubConfirm(t, true, nil)
	f := chart(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctsavings0001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(f.deleted) != "[acctsavings0001]" {
		t.Errorf("deleted = %v", f.deleted)
	}
	if decodeRecord(t, out)["deleted"] != true {
		t.Errorf("stdout:\n%s", out)
	}
}

// An answer that cannot be read (EOF, a closed pipe) is a usage error with an
// instruction, not the bare "EOF".
func TestDeleteUnreadableAnswerIsAUsageError(t *testing.T) {
	stubConfirm(t, false, io.EOF)
	f := chart(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctsavings0001")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Fatalf("exit = %d, want 2; err: %v", got, err)
	}
	if err == nil || err.Error() != "no answer read; pass --yes to delete without asking" {
		t.Errorf("error = %v", err)
	}
	if len(f.deleted) != 0 {
		t.Errorf("deleted: %v", f.deleted)
	}
}

func TestDeleteOfAMissingRecordIsExit5(t *testing.T) {
	f := chart(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "nope", "--yes")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Fatalf("exit = %d, want 5; err: %v", got, err)
	}
	if fmt.Sprint(f.requests) != "[GET /api/collections/books_accounts/records/nope]" {
		t.Errorf("requests = %v", f.requests)
	}
}

// The server refuses to delete an account in use and says what to do. The
// message reaches the caller word for word, with exit 6.
func TestDeleteRefusalShowsTheServerMessage(t *testing.T) {
	f := chart(t)
	const message = "This account is used on 3 journal lines and cannot be deleted. Make it inactive instead."
	f.refuse("DELETE", 400, `{"data":{},"message":"`+message+`","status":400}`)
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "delete", "acctchecking001", "--yes", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused {
		t.Fatalf("exit = %d, want 6; err: %v", got, err)
	}
	var doc errorDoc
	if jsonErr := json.Unmarshal([]byte(out), &doc); jsonErr != nil {
		t.Fatal(jsonErr)
	}
	if doc.Error.Message != message {
		t.Errorf("message = %q", doc.Error.Message)
	}
	if f.find("books_accounts", "acctchecking001") == nil {
		t.Error("the fake deleted a record the server refused to delete")
	}
}

func TestDeleteHelpSaysWhenTheServerRefuses(t *testing.T) {
	out, _, err := runCmd(t, nil, "", "books", "accounts", "delete", "--help")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"cannot be undone", "--yes", "Make it inactive with `deactivate`"} {
		if !strings.Contains(out, want) {
			t.Errorf("the help has no %q:\n%s", want, out)
		}
	}
}

func TestResourceGroupCommands(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "accounts"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), " "); got != "activate add deactivate delete edit list show types" {
		t.Errorf("accounts commands = %q", got)
	}
}
