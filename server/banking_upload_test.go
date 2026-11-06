package books

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"mime/multipart"
	"net/http"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const filesURL = "/api/collections/books_bank_files/records"

// bankCSV is BANK_CSV_SAMPLE (tinycld/books/lib/bank-connection-fixture.ts).
const bankCSV = "Date,Description,Amount\n" +
	"2026-09-02,Deposit - Harbor Design client payment,4250.00\n" +
	"2026-09-05,Card purchase - Office Depot,-86.47\n" +
	"2026-09-09,ACH - Northwind Card Services payment,-1200.00\n" +
	"2026-09-15,Transfer to savings,-500.00\n" +
	"2026-09-22,Deposit - Lumen Labs client payment,1875.00\n" +
	"2026-09-30,Monthly service fee,-12.00\n"

const bankOFX = "OFXHEADER:100\n" +
	"DATA:OFXSGML\n" +
	"VERSION:102\n" +
	"\n" +
	"<OFX>\n" +
	"<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n" +
	"<CURDEF>USD\n" +
	"<BANKTRANLIST>\n" +
	"<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261001\n<TRNAMT>3100.00\n<FITID>2026000001\n<NAME>Harbor Design\n</STMTTRN>\n" +
	"</BANKTRANLIST>\n" +
	"</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n" +
	"</OFX>\n"

// bankEnv is a migrated app with every ledger hook bound (registerLedger binds
// the banking hooks last), one user per level, the 1000 Business Checking bank
// account and its connection.
type bankEnv struct {
	app        *tests.TestApp
	users      levelUsers
	checking   *core.Record
	connection *core.Record
}

func newBankEnv(t *testing.T) *bankEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	users := newLevelUsers(t, app)
	checking := saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Business Checking", "number": "1000", "type": "bank", "detail_type": "checking", "currency": "USD",
	})
	connection := saveRecord(t, app, "books_bank_connections", map[string]any{"account": checking.Id})
	return &bankEnv{app: app, users: users, checking: checking, connection: connection}
}

// savings is a second bank account, not connected.
func (env *bankEnv) savings(t testing.TB) *core.Record {
	t.Helper()
	return saveRecord(t, env.app, "books_accounts", map[string]any{
		"name": "Business Savings", "number": "1010", "type": "bank", "detail_type": "savings", "currency": "USD",
	})
}

// uploadReq is one multipart file create through PocketBase's real router, as
// core's uploadRecordWithFile sends it: the connection field, any extra
// fields, and a file part named "file" (none when name is empty). One call per
// app, as apiReq.
type uploadReq struct {
	token      string
	connection string
	name       string
	data       []byte
	extra      map[string]string
	want       int
	content    []string
	after      func(t testing.TB, app *tests.TestApp)
}

func (r uploadReq) run(t *testing.T, app *tests.TestApp) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField("connection", r.connection); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(r.extra))
	for k := range r.extra {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		if err := w.WriteField(k, r.extra[k]); err != nil {
			t.Fatal(err)
		}
	}
	if r.name != "" {
		part, err := w.CreateFormFile("file", r.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(r.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	headers := map[string]string{"Content-Type": w.FormDataContentType()}
	if r.token != "" {
		headers["Authorization"] = r.token
	}
	scenario := &tests.ApiScenario{
		Name:                  "upload " + r.name,
		Method:                http.MethodPost,
		URL:                   filesURL,
		Body:                  bytes.NewReader(body.Bytes()),
		Headers:               headers,
		ExpectedStatus:        r.want,
		ExpectedContent:       r.content,
		TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
		DisableTestAppCleanup: true,
	}
	if len(r.content) == 0 {
		scenario.NotExpectedContent = []string{"\x00"}
	}
	if r.after != nil {
		after := r.after
		scenario.AfterTestFunc = func(t testing.TB, app *tests.TestApp, _ *http.Response) { after(t, app) }
	}
	scenario.Test(t)
}

// upload is the bookkeeper's upload of one file to the env's connection.
func (env *bankEnv) upload(t testing.TB, name string, data []byte) uploadReq {
	t.Helper()
	return uploadReq{token: tokenFor(t, env.users.bookkeeper), connection: env.connection.Id, name: name, data: data}
}

func refusedWith(message string) []string {
	return []string{`"message":"` + message + `"`}
}

func requireNoBankFile(t testing.TB, app core.App) {
	t.Helper()
	if n, err := app.CountRecords("books_bank_files"); err != nil || n != 0 {
		t.Errorf("%d bank files exist after a refused upload (err %v), want 0", n, err)
	}
}

// onlyBankFile is the one stored file of the connection.
func onlyBankFile(t testing.TB, app core.App, connectionID string) *core.Record {
	t.Helper()
	rows, err := app.FindAllRecords("books_bank_files", dbx.HashExp{"connection": connectionID})
	if err != nil {
		t.Fatalf("find bank files: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("%d bank files on the connection, want 1", len(rows))
	}
	return rows[0]
}

func requireFormat(want string, connectionID string) func(testing.TB, *tests.TestApp) {
	return func(t testing.TB, app *tests.TestApp) {
		t.Helper()
		if got := onlyBankFile(t, app, connectionID).GetString("format"); got != want {
			t.Errorf("format = %q, want %q", got, want)
		}
	}
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// paddedCSV is bankCSV followed by CSV rows, exactly size bytes long.
func paddedCSV(size int) []byte {
	b := []byte(bankCSV)
	row := []byte("2026-09-30,Padding row to reach the size limit,0.00\n")
	for len(b)+len(row) <= size {
		b = append(b, row...)
	}
	if rest := size - len(b); rest > 0 {
		b = append(b, bytes.Repeat([]byte("0"), rest-1)...)
		b = append(b, '\n')
	}
	return b
}

// saveBankFile stores a file the way a Go caller does (the model path, no
// request hook), with every stamped field set here.
func saveBankFile(t testing.TB, app core.App, connectionID, name, status string, data []byte) *core.Record {
	t.Helper()
	file, err := filesystem.NewFileFromBytes(data, name)
	if err != nil {
		t.Fatalf("file: %v", err)
	}
	return saveRecord(t, app, "books_bank_files", map[string]any{
		"connection":   connectionID,
		"file":         file,
		"name":         name,
		"format":       "csv",
		"size":         len(data),
		"content_hash": sha256Hex(data),
		"status":       status,
	})
}

func TestBankUpload_StampsTheFile(t *testing.T) {
	env := newBankEnv(t)
	req := env.upload(t, "oct-2026.csv", []byte(bankCSV))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		row := onlyBankFile(t, app, env.connection.Id)
		got := map[string]any{
			"name":         row.GetString("name"),
			"format":       row.GetString("format"),
			"size":         row.GetInt("size"),
			"content_hash": row.GetString("content_hash"),
			"status":       row.GetString("status"),
			"uploaded_by":  row.GetString("uploaded_by"),
		}
		want := map[string]any{
			"name":         "oct-2026.csv",
			"format":       "csv",
			"size":         len(bankCSV),
			"content_hash": sha256Hex([]byte(bankCSV)),
			"status":       "uploaded",
			"uploaded_by":  env.users.bookkeeper.Id,
		}
		for k, v := range want {
			if got[k] != v {
				t.Errorf("%s = %#v, want %#v", k, got[k], v)
			}
		}
		if row.GetString("file") == "" {
			t.Error("the stored row has no file")
		}
	}
	req.run(t, env.app)
}

func TestBankUpload_SniffsOFX(t *testing.T) {
	lowerOFX := "<ofx>\n<bankmsgsrsv1><stmttrnrs><stmtrs>\n<curdef>USD\n</stmtrs></stmttrnrs></bankmsgsrsv1>\n</ofx>\n"
	cases := []struct {
		name string
		data string
	}{
		{"statement.ofx", bankOFX},
		{"card.QFX", lowerOFX},
		{"card.qbo", bankOFX},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, []byte(c.data))
			req.want = http.StatusOK
			req.after = requireFormat("ofx", env.connection.Id)
			req.run(t, env.app)
		})
	}
}

func TestBankUpload_RefusesAnEmptyFile(t *testing.T) {
	cases := []struct {
		label, name string
	}{
		{"zero bytes", "empty.csv"},
		{"no file part", ""},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, nil)
			req.want = http.StatusBadRequest
			req.content = refusedWith("This file is empty.")
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
			req.run(t, env.app)
		})
	}
}

func TestBankUpload_RefusesOtherExtensions(t *testing.T) {
	for _, name := range []string{"statement.pdf", "statement.txt"} {
		t.Run(name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, name, []byte(bankCSV))
			req.want = http.StatusBadRequest
			req.content = refusedWith("Choose a CSV, OFX, QFX or QBO file.")
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
			req.run(t, env.app)
		})
	}
	t.Run("STATEMENT.CSV", func(t *testing.T) {
		env := newBankEnv(t)
		req := env.upload(t, "STATEMENT.CSV", []byte(bankCSV))
		req.want = http.StatusOK
		req.after = requireFormat("csv", env.connection.Id)
		req.run(t, env.app)
	})
}

func TestBankUpload_RefusesMoreThan5MB(t *testing.T) {
	t.Run("one byte over", func(t *testing.T) {
		env := newBankEnv(t)
		data := paddedCSV(5_242_881)
		if len(data) != 5_242_881 {
			t.Fatalf("padded to %d bytes", len(data))
		}
		req := env.upload(t, "big.csv", data)
		req.want = http.StatusBadRequest
		req.content = refusedWith("Choose a file of 5 MB or less.")
		req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
		req.run(t, env.app)
	})
	t.Run("exactly 5 MB", func(t *testing.T) {
		env := newBankEnv(t)
		data := paddedCSV(5_242_880)
		if len(data) != 5_242_880 {
			t.Fatalf("padded to %d bytes", len(data))
		}
		req := env.upload(t, "limit.csv", data)
		req.want = http.StatusOK
		req.after = func(t testing.TB, app *tests.TestApp) {
			if got := onlyBankFile(t, app, env.connection.Id).GetInt("size"); got != 5_242_880 {
				t.Errorf("size = %d, want 5242880", got)
			}
		}
		req.run(t, env.app)
	})
}

func TestBankUpload_RefusesWhatIsNotABankFile(t *testing.T) {
	for _, c := range []struct{ name, data string }{
		{"notes.csv", "hello world\nno delimiters here\n"},
		{"nul.csv", "a,b\n\x00"},
	} {
		t.Run(c.name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, []byte(c.data))
			req.want = http.StatusBadRequest
			req.content = refusedWith("This does not look like a CSV or OFX bank file.")
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
			req.run(t, env.app)
		})
	}
	for _, c := range []struct{ name, data string }{
		{"blank-first.csv", "\n\n  \nDate;Amount\n"},
		{"tabs.csv", "Date\tDescription\tAmount\n2026-09-02\tDeposit\t4250.00\n"},
	} {
		t.Run(c.name, func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, c.name, []byte(c.data))
			req.want = http.StatusOK
			req.after = requireFormat("csv", env.connection.Id)
			req.run(t, env.app)
		})
	}
}

// The create rule pins the fields the server stamps, so a client cannot claim
// a format, a hash or an uploader.
func TestBankUpload_ClientCannotSetStampedFields(t *testing.T) {
	for _, field := range []string{"name", "format", "size", "content_hash", "status", "uploaded_by"} {
		t.Run(field, func(t *testing.T) {
			env := newBankEnv(t)
			values := map[string]string{
				"name": "other.csv", "format": "csv", "size": "10", "content_hash": strings.Repeat("a", 64),
				"status": "uploaded", "uploaded_by": env.users.bookkeeper.Id,
			}
			req := env.upload(t, "oct-2026.csv", []byte(bankCSV))
			req.extra = map[string]string{field: values[field]}
			req.want = http.StatusBadRequest
			req.content = refusedWith("Failed to create record.")
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
			req.run(t, env.app)
		})
	}
}

func TestBankUpload_OnlyWritersUpload(t *testing.T) {
	for _, level := range []Level{LevelNone, LevelReadOnly} {
		t.Run(string(level), func(t *testing.T) {
			env := newBankEnv(t)
			req := env.upload(t, "oct-2026.csv", []byte(bankCSV))
			req.token = tokenFor(t, env.users.byLevel(level))
			req.want = http.StatusBadRequest
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoBankFile(t, app) }
			req.run(t, env.app)
		})
	}
	t.Run("admin", func(t *testing.T) {
		env := newBankEnv(t)
		req := env.upload(t, "oct-2026.csv", []byte(bankCSV))
		req.token = tokenFor(t, env.users.admin)
		req.want = http.StatusOK
		req.after = func(t testing.TB, app *tests.TestApp) {
			if got := onlyBankFile(t, app, env.connection.Id).GetString("uploaded_by"); got != env.users.admin.Id {
				t.Errorf("uploaded_by = %q, want the admin %q", got, env.users.admin.Id)
			}
		}
		req.run(t, env.app)
	})
}

func TestBankConnection_StampsCreatedBy(t *testing.T) {
	t.Run("stamped", func(t *testing.T) {
		env := newBankEnv(t)
		savings := env.savings(t)
		apiReq{
			method: http.MethodPost,
			url:    "/api/collections/books_bank_connections/records",
			token:  tokenFor(t, env.users.bookkeeper),
			body:   `{"account":"` + savings.Id + `"}`,
			want:   http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) {
				row, err := app.FindFirstRecordByData("books_bank_connections", "account", savings.Id)
				if err != nil {
					t.Fatalf("find the new connection: %v", err)
				}
				if got := row.GetString("created_by"); got != env.users.bookkeeper.Id {
					t.Errorf("created_by = %q, want the bookkeeper %q", got, env.users.bookkeeper.Id)
				}
			},
		}.run(t, env.app)
	})
	t.Run("sent by the client", func(t *testing.T) {
		env := newBankEnv(t)
		savings := env.savings(t)
		apiReq{
			method: http.MethodPost,
			url:    "/api/collections/books_bank_connections/records",
			token:  tokenFor(t, env.users.bookkeeper),
			body:   `{"account":"` + savings.Id + `","created_by":"` + env.users.admin.Id + `"}`,
			want:   http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_bank_connections", dbx.HashExp{"account": savings.Id}); n != 0 {
					t.Errorf("%d connections on savings after a refused create, want 0", n)
				}
			},
		}.run(t, env.app)
	})
}

func TestBankRules_UpdateAndDelete(t *testing.T) {
	t.Run("connection account cannot change", func(t *testing.T) {
		env := newBankEnv(t)
		savings := env.savings(t)
		apiReq{
			method: http.MethodPatch,
			url:    "/api/collections/books_bank_connections/records/" + env.connection.Id,
			token:  tokenFor(t, env.users.bookkeeper),
			body:   `{"account":"` + savings.Id + `"}`,
			// A failed update rule answers 404: PocketBase re-reads the record
			// through the rule (record_crud.go recordUpdate).
			want: http.StatusNotFound,
			after: func(t testing.TB, app *tests.TestApp) {
				if got := reload(t, app, "books_bank_connections", env.connection.Id).GetString("account"); got != env.checking.Id {
					t.Errorf("account = %q after a refused change, want checking %q", got, env.checking.Id)
				}
			},
		}.run(t, env.app)
	})
	t.Run("connection institution changes", func(t *testing.T) {
		env := newBankEnv(t)
		apiReq{
			method: http.MethodPatch,
			url:    "/api/collections/books_bank_connections/records/" + env.connection.Id,
			token:  tokenFor(t, env.users.bookkeeper),
			body:   `{"institution":"First Community Bank"}`,
			want:   http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) {
				if got := reload(t, app, "books_bank_connections", env.connection.Id).GetString("institution"); got != "First Community Bank" {
					t.Errorf("institution = %q, want %q", got, "First Community Bank")
				}
			},
		}.run(t, env.app)
	})
	t.Run("a stored file cannot be updated", func(t *testing.T) {
		env := newBankEnv(t)
		file := saveBankFile(t, env.app, env.connection.Id, "x.csv", "uploaded", []byte(bankCSV))
		apiReq{
			method: http.MethodPatch,
			url:    filesURL + "/" + file.Id,
			token:  tokenFor(t, env.users.admin),
			body:   `{"status":"imported"}`,
			want:   http.StatusForbidden,
			after: func(t testing.TB, app *tests.TestApp) {
				if got := reload(t, app, "books_bank_files", file.Id).GetString("status"); got != "uploaded" {
					t.Errorf("status = %q after a refused update, want uploaded", got)
				}
			},
		}.run(t, env.app)
	})
	t.Run("an uploaded file is deleted", func(t *testing.T) {
		env := newBankEnv(t)
		file := saveBankFile(t, env.app, env.connection.Id, "x.csv", "uploaded", []byte(bankCSV))
		apiReq{
			method: http.MethodDelete,
			url:    filesURL + "/" + file.Id,
			token:  tokenFor(t, env.users.bookkeeper),
			want:   http.StatusNoContent,
			after: func(t testing.TB, app *tests.TestApp) {
				if _, err := app.FindRecordById("books_bank_files", file.Id); err == nil {
					t.Error("the uploaded file still exists after its delete")
				}
			},
		}.run(t, env.app)
	})
	t.Run("an imported file stays", func(t *testing.T) {
		env := newBankEnv(t)
		file := saveBankFile(t, env.app, env.connection.Id, "x.csv", "uploaded", []byte(bankCSV))
		file.Set("status", "imported")
		if err := env.app.Save(file); err != nil {
			t.Fatalf("set imported: %v", err)
		}
		apiReq{
			method: http.MethodDelete,
			url:    filesURL + "/" + file.Id,
			token:  tokenFor(t, env.users.bookkeeper),
			want:   http.StatusNotFound,
			after: func(t testing.TB, app *tests.TestApp) {
				if got := reload(t, app, "books_bank_files", file.Id).GetString("status"); got != "imported" {
					t.Errorf("status = %q, want the imported file to stay", got)
				}
			},
		}.run(t, env.app)
	})
}

func TestSniffBankFile(t *testing.T) {
	noDelimiters := strings.Repeat("plain words without any separator\n", 200)
	if len(noDelimiters) <= bankFileSniffBytes {
		t.Fatalf("the no-delimiter text is %d bytes, want more than %d", len(noDelimiters), bankFileSniffBytes)
	}
	cases := []struct {
		label      string
		data       string
		wantFormat string
		wantOK     bool
	}{
		{"OFX header", "OFXHEADER:100\nDATA:OFXSGML\n", "ofx", true},
		{"OFX tag mid-text", "some preamble\nmore\n<OFX>\n<BANKMSGSRSV1>\n", "ofx", true},
		{"lower-case OFX tag", "<ofx>\n<stmttrn>\n", "ofx", true},
		{"comma header", "Date,Amount\n", "csv", true},
		{"blank lines then a tab header", "\r\n\r\nDate\tAmount", "csv", true},
		{"BOM then a comma header", "\xEF\xBB\xBFDate,Amount\n", "csv", true},
		{"no delimiter", "hello\n", "", false},
		{"NUL byte with commas", "Date,Amount\n2026-09-02,\x00,1.00\n", "", false},
		{"OFX header after the sniffed head", noDelimiters + "OFXHEADER:100\n", "", false},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			format, ok := sniffBankFile([]byte(c.data))
			if format != c.wantFormat || ok != c.wantOK {
				t.Errorf("sniffBankFile = (%q, %v), want (%q, %v)", format, ok, c.wantFormat, c.wantOK)
			}
		})
	}
}

func TestTruncateRunes(t *testing.T) {
	if got := truncateRunes("oct.csv", 255); got != "oct.csv" {
		t.Errorf("truncateRunes(oct.csv) = %q, want it unchanged", got)
	}
	long := strings.Repeat("é", 300)
	if got := truncateRunes(long, 255); got != strings.Repeat("é", 255) {
		t.Errorf("300 é cut to %d runes (%d bytes), want 255 runes", utf8.RuneCountInString(got), len(got))
	}
	// A 3-byte rune is never split: the cut lands between runes.
	euros := strings.Repeat("€", 300)
	got := truncateRunes(euros, 255)
	if !utf8.ValidString(got) || got != strings.Repeat("€", 255) {
		t.Errorf("300 € cut to %d runes, %d bytes (valid UTF-8 %v), want 255 whole runes",
			utf8.RuneCountInString(got), len(got), utf8.ValidString(got))
	}
}

func TestBankFiles_FileFieldIsProtected(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_bank_files")
	if err != nil {
		t.Fatalf("find books_bank_files: %v", err)
	}
	field, ok := col.Fields.GetByName("file").(*core.FileField)
	if !ok {
		t.Fatalf("books_bank_files.file is %T, want *core.FileField", col.Fields.GetByName("file"))
	}
	if !field.Protected || field.MaxSize != 5_242_880 || field.MaxSelect != 1 {
		t.Errorf("file field protected=%v maxSize=%d maxSelect=%d, want true 5242880 1",
			field.Protected, field.MaxSize, field.MaxSelect)
	}
	// The schema's limit and the request hook's limit are one number.
	if field.MaxSize != maxBankFileBytes {
		t.Errorf("file field maxSize %d differs from maxBankFileBytes %d", field.MaxSize, maxBankFileBytes)
	}
}
