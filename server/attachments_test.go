package books

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"mime/multipart"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// Attachments (spec §3.5, §3.6, §3.8, §4): the books_attachments rows of a
// bill or an expense, their server stamps and guards. The requests go through
// PocketBase's real router, so the create-request and delete-request hooks run
// as they do for core uploadRecordWithFile and the client's delete.

const attachmentsURL = "/api/collections/books_attachments/records"

// The refusal texts, written out here, not read from the consts, so a change
// of wording fails this file too. Each ends with a period, so PocketBase adds
// none.
const (
	wantAttachmentOneParent  = "An attachment belongs to one bill or one expense."
	wantAttachmentBillVoid   = "This bill is void. Its attachments can't change."
	wantAttachmentExpVoid    = "This expense is void. Its attachments can't change."
	wantAttachmentBillLimit  = "A bill holds at most 25 attachments."
	wantAttachmentExpLimit   = "An expense holds at most 25 attachments."
	wantAttachmentNotChanged = "An attachment is not changed. Remove it and attach the file again."
)

func wantAttachmentTooLarge(name string) string {
	return name + " is larger than 20 MB."
}

func wantAttachmentType(name string) string {
	return name + " is not a file type Books keeps. Attach a PDF, an image, or an office or text file."
}

// attachEnv is the e2e book of a bill and an expense (expenseEnv: the e2e
// chart's expense and payment accounts, the vendors, the purchased products,
// one user per level) with the bill and expense guards and their generated
// forms hosts bound. registerLedger binds the attachment hooks.
type attachEnv struct {
	*expenseEnv
}

func newAttachEnv(t *testing.T) *attachEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, billKind)
	registerSalesDocGuards(env.app, expenseKind)
	bindHostsByKey(t, env.app, billKind.HostKey, expenseKind.HostKey)
	return &attachEnv{expenseEnv: expenseEnvOn(t, env)}
}

// draftBill is an Office Supply World draft with one account line.
func (ae *attachEnv) draftBill(t testing.TB) *core.Record {
	t.Helper()
	bill := mkBill(t, ae.app, ae.officeSupply, map[string]any{"memo": "Q4 supplies"})
	mkBillLine(t, ae.app, bill, 0, accountLine(ae.designTools, 12500))
	return bill
}

func (ae *attachEnv) postedBill(t testing.TB) *core.Record {
	t.Helper()
	return mustPostBill(t, ae.app, ae.draftBill(t).Id, ae.users.bookkeeper.Id)
}

func (ae *attachEnv) voidBill(t testing.TB, bill *core.Record) *core.Record {
	t.Helper()
	if err := voidBillAs(ae.app, bill.Id, ae.users.admin.Id); err != nil {
		t.Fatalf("void bill %s: %v", bill.Id, err)
	}
	return reload(t, ae.app, "books_bills", bill.Id)
}

// draftExpense is an Office Supply World draft with one account line.
func (ae *attachEnv) draftExpense(t testing.TB) *core.Record {
	t.Helper()
	exp := ae.mkExpense(t, map[string]any{"vendor": ae.officeSupply.Id, "memo": "Receipt"})
	mkExpenseLine(t, ae.app, exp, 0, accountLine(ae.designTools, 6418))
	return exp
}

func (ae *attachEnv) postedExpense(t testing.TB) *core.Record {
	t.Helper()
	return mustPostExpense(t, ae.app, ae.draftExpense(t).Id, ae.users.bookkeeper.Id)
}

func onBill(id string) map[string]any    { return map[string]any{"bill": id} }
func onExpense(id string) map[string]any { return map[string]any{"expense": id} }

// storeAttachment saves an attachment the way a Go caller does (the model
// path: the create guard runs, the request hook does not), with the stamped
// fields set here. It returns the save's error, so a racing goroutine or a
// refusal check can read it.
func storeAttachment(app core.App, parent map[string]any, field, name string, data []byte) (*core.Record, error) {
	col, err := app.FindCollectionByNameOrId("books_attachments")
	if err != nil {
		return nil, err
	}
	file, err := filesystem.NewFileFromBytes(data, name)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	for k, v := range parent {
		r.Set(k, v)
	}
	r.Set("field", field)
	r.Set("file", file)
	r.Set("name", name)
	r.Set("size", len(data))
	if err := app.Save(r); err != nil {
		return nil, err
	}
	return r, nil
}

func mustStoreAttachment(t testing.TB, app core.App, parent map[string]any, field, name string) *core.Record {
	t.Helper()
	r, err := storeAttachment(app, parent, field, name, pdfBytes(1024))
	if err != nil {
		t.Fatalf("store attachment %s: %v", name, err)
	}
	return r
}

// attachmentsOn are the rows whose parent column holds id.
func attachmentsOn(t testing.TB, app core.App, column, id string) []*core.Record {
	t.Helper()
	rows, err := app.FindAllRecords("books_attachments", dbx.HashExp{column: id})
	if err != nil {
		t.Fatalf("find attachments on %s %s: %v", column, id, err)
	}
	return rows
}

func requireAttachmentCount(t testing.TB, app core.App, column, id string, want int) {
	t.Helper()
	if got := len(attachmentsOn(t, app, column, id)); got != want {
		t.Errorf("%d attachments on %s %s, want %d", got, column, id, want)
	}
}

// storedFileExists reports whether the row's file is in storage.
func storedFileExists(t testing.TB, app core.App, r *core.Record) bool {
	t.Helper()
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("open the filesystem: %v", err)
	}
	defer fsys.Close()
	ok, err := fsys.Exists(r.BaseFilesPath() + "/" + r.GetString("file"))
	if err != nil {
		t.Fatalf("check the stored file: %v", err)
	}
	return ok
}

// pdfBytes is a PDF header padded with zero bytes to size: the sniffer reads
// application/pdf from the head, whatever follows.
func pdfBytes(size int) []byte {
	b := []byte("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
	if size > len(b) {
		b = append(b, make([]byte, size-len(b))...)
	}
	return b
}

// oleBytes is a minimal compound file (the .xls / .doc container): a v3
// header whose directory starts at sector 0, and that sector's root entry
// with clsid. PocketBase's sniffer tells Excel from Word by this CLSID; with
// none it answers application/x-ole-storage.
func oleBytes(clsid []byte) []byte {
	b := make([]byte, 1536)
	copy(b, []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1})
	binary.LittleEndian.PutUint16(b[24:], 0x003E)
	binary.LittleEndian.PutUint16(b[26:], 0x0003)
	binary.LittleEndian.PutUint16(b[28:], 0xFFFE)
	binary.LittleEndian.PutUint16(b[30:], 9)
	binary.LittleEndian.PutUint16(b[32:], 6)
	copy(b[512+80:], clsid)
	return b
}

var (
	excelCLSID = []byte{0x10, 0x08, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}
	wordCLSID  = []byte{0x06, 0x09, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}
)

// ooxmlBytes is a minimal Office Open XML zip whose part lives under dir
// ("xl/" for a workbook, "word/" for a document).
func ooxmlBytes(t testing.TB, dir string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", dir + "document.xml"} {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte("<x/>")); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// exeBytes starts as a Windows executable does.
func exeBytes() []byte {
	return append([]byte("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"), make([]byte, 512)...)
}

// attachReq is one multipart create of books_attachments through PocketBase's
// real router, as core uploadRecordWithFile and core FileField send it: the
// form fields, and a file part named "file" (none when name is empty). One
// call per app, as apiReq.
type attachReq struct {
	token   string
	fields  map[string]string
	name    string
	data    []byte
	want    int
	content []string
	after   func(t testing.TB, app *tests.TestApp)
}

func (r attachReq) run(t *testing.T, app *tests.TestApp) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	keys := make([]string, 0, len(r.fields))
	for k := range r.fields {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		if err := w.WriteField(k, r.fields[k]); err != nil {
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
		Name:                  "attach " + r.name,
		Method:                http.MethodPost,
		URL:                   attachmentsURL,
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

// attach is the bookkeeper's upload of one file to the parent.
func (ae *attachEnv) attach(t testing.TB, column, id, name string, data []byte) attachReq {
	t.Helper()
	return attachReq{
		token:  tokenFor(t, ae.users.bookkeeper),
		fields: map[string]string{column: id},
		name:   name,
		data:   data,
	}
}

func requireNoAttachments(t testing.TB, app core.App) {
	t.Helper()
	if n, err := app.CountRecords("books_attachments"); err != nil || n != 0 {
		t.Errorf("%d attachments exist after a refused create (err %v), want 0", n, err)
	}
}

// onlyAttachment is the one row on the parent.
func onlyAttachment(t testing.TB, app core.App, column, id string) *core.Record {
	t.Helper()
	rows := attachmentsOn(t, app, column, id)
	if len(rows) != 1 {
		t.Fatalf("%d attachments on %s %s, want 1", len(rows), column, id)
	}
	return rows[0]
}

func TestAttachments_Schema(t *testing.T) {
	if attachmentsCollection != "books_attachments" {
		t.Errorf("attachmentsCollection = %q, want books_attachments", attachmentsCollection)
	}
	if maxAttachmentBytes != 20_971_520 || maxAttachmentsPerDocument != 25 {
		t.Errorf("limits %d bytes / %d files, want 20971520 / 25", maxAttachmentBytes, maxAttachmentsPerDocument)
	}
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_attachments")
	if err != nil {
		t.Fatalf("find books_attachments: %v", err)
	}
	field, ok := col.Fields.GetByName("file").(*core.FileField)
	if !ok {
		t.Fatalf("books_attachments.file is %T, want *core.FileField", col.Fields.GetByName("file"))
	}
	if !field.Protected || !field.Required || field.MaxSelect != 1 || field.MaxSize != maxAttachmentBytes {
		t.Errorf("file field protected=%v required=%v maxSelect=%d maxSize=%d, want true true 1 %d",
			field.Protected, field.Required, field.MaxSelect, field.MaxSize, maxAttachmentBytes)
	}
	if !reflect.DeepEqual(field.Thumbs, []string{"40x40"}) {
		t.Errorf("thumbs = %v, want [40x40]", field.Thumbs)
	}
	wantTypes := []string{
		"application/pdf",
		"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
		"text/plain", "text/csv",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	}
	got := slices.Clone(field.MimeTypes)
	slices.Sort(got)
	want := slices.Clone(wantTypes)
	slices.Sort(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("file mimeTypes = %v, want %v", field.MimeTypes, wantTypes)
	}
	server := slices.Clone(attachmentMimeTypes)
	slices.Sort(server)
	if !reflect.DeepEqual(server, want) {
		t.Errorf("attachmentMimeTypes = %v, want the schema's %v", attachmentMimeTypes, wantTypes)
	}
	for _, name := range []string{"bill", "expense"} {
		rel, ok := col.Fields.GetByName(name).(*core.RelationField)
		if !ok || !rel.CascadeDelete || rel.Required || rel.MaxSelect != 1 {
			t.Errorf("%s = %+v, want an optional single relation that cascades on delete", name, col.Fields.GetByName(name))
		}
	}
	if col.UpdateRule != nil {
		t.Errorf("update rule = %q, want null (an attachment never changes)", *col.UpdateRule)
	}
}

// The server writes name, size and uploaded_by from the upload and the auth
// record, whatever the body sent.
func TestAttachmentUpload_StampsTheUpload(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(3072))
	req.fields["name"] = "renamed.exe"
	req.fields["size"] = "1"
	req.fields["uploaded_by"] = ae.users.admin.Id
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		row := onlyAttachment(t, app, "bill", bill.Id)
		got := map[string]any{
			"name":        row.GetString("name"),
			"size":        row.GetInt("size"),
			"uploaded_by": row.GetString("uploaded_by"),
			"field":       row.GetString("field"),
		}
		want := map[string]any{
			"name":        "OSW-invoice-1002.pdf",
			"size":        3072,
			"uploaded_by": ae.users.bookkeeper.Id,
			"field":       "",
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("stored row = %v, want %v", got, want)
		}
		if row.GetString("file") == "" || !storedFileExists(t, app, row) {
			t.Error("the stored row has no file in storage")
		}
	}
	req.run(t, ae.app)
}

func TestAttachmentUpload_TrimsALongNameTo255Runes(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	long := strings.Repeat("é", 296) + ".pdf"
	req := ae.attach(t, "bill", bill.Id, long, pdfBytes(2048))
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		want := string([]rune(long)[:255])
		if got := onlyAttachment(t, app, "bill", bill.Id).GetString("name"); got != want {
			t.Errorf("name is %d runes, want the first 255 runes of the 300-rune original", len([]rune(got)))
		}
	}
	req.run(t, ae.app)
}

// The seed uploads as a superuser and names the uploader itself.
func TestAttachmentUpload_ASuperuserKeepsTheUploaderItSent(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(2048))
	req.token = tokenFor(t, mkSuperuser(t, ae.app))
	req.fields["uploaded_by"] = ae.users.admin.Id
	req.want = http.StatusOK
	req.after = func(t testing.TB, app *tests.TestApp) {
		if got := onlyAttachment(t, app, "bill", bill.Id).GetString("uploaded_by"); got != ae.users.admin.Id {
			t.Errorf("uploaded_by = %q, want the admin it sent %q", got, ae.users.admin.Id)
		}
	}
	req.run(t, ae.app)
}

func TestAttachmentUpload_APostedDocumentTakesFiles(t *testing.T) {
	t.Run("bill", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(2048))
		req.want = http.StatusOK
		req.after = func(t testing.TB, app *tests.TestApp) { requireAttachmentCount(t, app, "bill", bill.Id, 1) }
		req.run(t, ae.app)
	})
	t.Run("expense", func(t *testing.T) {
		ae := newAttachEnv(t)
		exp := ae.postedExpense(t)
		req := ae.attach(t, "expense", exp.Id, "receipt.pdf", pdfBytes(2048))
		req.want = http.StatusOK
		req.after = func(t testing.TB, app *tests.TestApp) { requireAttachmentCount(t, app, "expense", exp.Id, 1) }
		req.run(t, ae.app)
	})
}

// A failed create rule answers 400 "Failed to create record."
// (apis/record_crud.go), as TestBankUpload_OnlyWritersUpload pins for bank
// files.
func TestAttachmentUpload_AReadOnlyMemberCannotAdd(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.postedBill(t)
	req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(2048))
	req.token = tokenFor(t, ae.users.readOnly)
	req.want = http.StatusBadRequest
	req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
	req.run(t, ae.app)
}

func TestAttachments_AReadOnlyMemberListsAndViews(t *testing.T) {
	setup := func(t *testing.T) (*attachEnv, *core.Record) {
		t.Helper()
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		return ae, mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
	}
	t.Run("list", func(t *testing.T) {
		ae, row := setup(t)
		apiReq{
			method:  http.MethodGet,
			url:     attachmentsURL,
			token:   tokenFor(t, ae.users.readOnly),
			want:    http.StatusOK,
			content: []string{`"totalItems":1`, `"id":"` + row.Id + `"`, `"name":"OSW-invoice-1002.pdf"`},
		}.run(t, ae.app)
	})
	t.Run("view", func(t *testing.T) {
		ae, row := setup(t)
		apiReq{
			method:  http.MethodGet,
			url:     attachmentsURL + "/" + row.Id,
			token:   tokenFor(t, ae.users.readOnly),
			want:    http.StatusOK,
			content: []string{`"name":"OSW-invoice-1002.pdf"`},
		}.run(t, ae.app)
	})
}

func TestAttachmentUpload_NeedsExactlyOneParent(t *testing.T) {
	t.Run("neither", func(t *testing.T) {
		ae := newAttachEnv(t)
		req := ae.attach(t, "field", "", "OSW-invoice-1002.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentOneParent)
		req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
		req.run(t, ae.app)
	})
	t.Run("both", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.draftBill(t)
		exp := ae.draftExpense(t)
		req := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", pdfBytes(2048))
		req.fields["expense"] = exp.Id
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentOneParent)
		req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
		req.run(t, ae.app)
	})
}

func TestAttachments_AVoidDocumentIsReadOnly(t *testing.T) {
	t.Run("create on a void bill", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.voidBill(t, ae.postedBill(t))
		req := ae.attach(t, "bill", bill.Id, "late.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentBillVoid)
		req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
		req.run(t, ae.app)
	})
	t.Run("create on a void expense", func(t *testing.T) {
		ae := newAttachEnv(t)
		exp := ae.postedExpense(t)
		if err := voidExpenseAs(ae.app, exp.Id, ae.users.admin.Id); err != nil {
			t.Fatalf("void the expense: %v", err)
		}
		req := ae.attach(t, "expense", exp.Id, "late.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentExpVoid)
		req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
		req.run(t, ae.app)
	})
	t.Run("delete on a void bill", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		row := mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
		ae.voidBill(t, bill)
		apiReq{
			method:  http.MethodDelete,
			url:     attachmentsURL + "/" + row.Id,
			token:   tokenFor(t, ae.users.bookkeeper),
			want:    http.StatusBadRequest,
			content: refusedWith(wantAttachmentBillVoid),
			after: func(t testing.TB, app *tests.TestApp) {
				stored := reload(t, app, "books_attachments", row.Id)
				if !storedFileExists(t, app, stored) {
					t.Error("the void bill's file left storage after a refused delete")
				}
			},
		}.run(t, ae.app)
	})
}

func TestAttachmentDelete_OnAPostedBillRemovesTheFile(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.postedBill(t)
	row := mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
	if !storedFileExists(t, ae.app, row) {
		t.Fatal("the stored row has no file in storage")
	}
	apiReq{
		method: http.MethodDelete,
		url:    attachmentsURL + "/" + row.Id,
		token:  tokenFor(t, ae.users.bookkeeper),
		want:   http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			if _, err := app.FindRecordById("books_attachments", row.Id); err == nil {
				t.Error("the attachment still exists after its delete")
			}
			// PocketBase removes the stored file just after the delete commits.
			waitFor(t, func() bool { return !storedFileExists(t, app, row) })
		},
	}.run(t, ae.app)
}

// The limit counts every row of the document: section rows and custom File
// field rows alike.
func TestAttachmentUpload_HoldsAtMost25PerDocument(t *testing.T) {
	fill := func(t *testing.T, app core.App, parent map[string]any) {
		t.Helper()
		for i := range 25 {
			field := ""
			if i%3 == 0 {
				field = "w9_form"
			}
			mustStoreAttachment(t, app, parent, field, "page.pdf")
		}
	}
	t.Run("bill", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.draftBill(t)
		fill(t, ae.app, onBill(bill.Id))
		req := ae.attach(t, "bill", bill.Id, "one-more.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentBillLimit)
		req.after = func(t testing.TB, app *tests.TestApp) { requireAttachmentCount(t, app, "bill", bill.Id, 25) }
		req.run(t, ae.app)
	})
	t.Run("expense", func(t *testing.T) {
		ae := newAttachEnv(t)
		exp := ae.draftExpense(t)
		fill(t, ae.app, onExpense(exp.Id))
		req := ae.attach(t, "expense", exp.Id, "one-more.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentExpLimit)
		req.after = func(t testing.TB, app *tests.TestApp) { requireAttachmentCount(t, app, "expense", exp.Id, 25) }
		req.run(t, ae.app)
	})
}

// A correction's files and its original's are one document's: the original's
// move to the correction when it posts (spec §3.6).
func TestAttachmentUpload_ACorrectionCountsTheReplacedBillsFiles(t *testing.T) {
	ae := newAttachEnv(t)
	original := ae.postedBill(t)
	for range 20 {
		mustStoreAttachment(t, ae.app, onBill(original.Id), "", "page.pdf")
	}
	correction := mkBill(t, ae.app, ae.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
	for range 5 {
		mustStoreAttachment(t, ae.app, onBill(correction.Id), "", "page.pdf")
	}
	req := ae.attach(t, "bill", correction.Id, "one-more.pdf", pdfBytes(2048))
	req.want = http.StatusBadRequest
	req.content = refusedWith(wantAttachmentBillLimit)
	req.after = func(t testing.TB, app *tests.TestApp) {
		requireAttachmentCount(t, app, "bill", correction.Id, 5)
		requireAttachmentCount(t, app, "bill", original.Id, 20)
	}
	req.run(t, ae.app)
}

// A draft correction's files move to it when it posts, so a file added to the
// posted original counts them too: else original 22 + correction 3, then 3
// more on the original, would post a correction holding 28 (spec §4).
func TestAttachmentUpload_AnOriginalCountsItsDraftCorrectionsFiles(t *testing.T) {
	t.Run("bill", func(t *testing.T) {
		ae := newAttachEnv(t)
		original := ae.postedBill(t)
		for range 22 {
			mustStoreAttachment(t, ae.app, onBill(original.Id), "", "page.pdf")
		}
		correction := mkBill(t, ae.app, ae.officeSupply, map[string]any{"replaces": original.Id, "memo": "Corrected"})
		for range 3 {
			mustStoreAttachment(t, ae.app, onBill(correction.Id), "", "page.pdf")
		}
		req := ae.attach(t, "bill", original.Id, "one-more.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentBillLimit)
		req.after = func(t testing.TB, app *tests.TestApp) {
			requireAttachmentCount(t, app, "bill", original.Id, 22)
			requireAttachmentCount(t, app, "bill", correction.Id, 3)
		}
		req.run(t, ae.app)
	})
	t.Run("expense", func(t *testing.T) {
		ae := newAttachEnv(t)
		original := ae.postedExpense(t)
		for range 22 {
			mustStoreAttachment(t, ae.app, onExpense(original.Id), "", "receipt.pdf")
		}
		correction := ae.mkExpense(t, map[string]any{"vendor": ae.officeSupply.Id, "replaces": original.Id, "memo": "Corrected"})
		for range 3 {
			mustStoreAttachment(t, ae.app, onExpense(correction.Id), "", "receipt.pdf")
		}
		req := ae.attach(t, "expense", original.Id, "one-more.pdf", pdfBytes(2048))
		req.want = http.StatusBadRequest
		req.content = refusedWith(wantAttachmentExpLimit)
		req.after = func(t testing.TB, app *tests.TestApp) {
			requireAttachmentCount(t, app, "expense", original.Id, 22)
			requireAttachmentCount(t, app, "expense", correction.Id, 3)
		}
		req.run(t, ae.app)
	})
}

// uploadRecordWithFile keeps only the top-level message, so the size refusal
// must be that message, not PocketBase's "Failed to create record.".
func TestAttachmentUpload_RefusesAFileOver20MB(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	req := ae.attach(t, "bill", bill.Id, "warehouse-walkthrough.pdf", pdfBytes(maxAttachmentBytes+1))
	req.want = http.StatusBadRequest
	req.content = refusedWith(wantAttachmentTooLarge("warehouse-walkthrough.pdf"))
	req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
	req.run(t, ae.app)
}

// HTML, SVG and executables are refused, because a stored file opens from
// the app's own origin; a file is judged by its bytes, not only its name.
func TestAttachmentUpload_RefusesATypeBooksDoesNotKeep(t *testing.T) {
	cases := []struct {
		name string
		data []byte
	}{
		{"page.html", []byte("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>")},
		{"drawing.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`)},
		{"scan.pdf", exeBytes()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ae := newAttachEnv(t)
			bill := ae.draftBill(t)
			req := ae.attach(t, "bill", bill.Id, c.name, c.data)
			req.want = http.StatusBadRequest
			req.content = refusedWith(wantAttachmentType(c.name))
			req.after = func(t testing.TB, app *tests.TestApp) { requireNoAttachments(t, app) }
			req.run(t, ae.app)
		})
	}
}

// PocketBase's sniffer (mimetype v1.4.15) reads each of these samples as its
// own allow-listed type: notes.csv as text/csv, notes.txt as text/plain, the
// .xls and .doc by their root CLSID as application/vnd.ms-excel and
// application/msword, the .xlsx and .docx by their xl/ and word/ parts as the
// OOXML types. So no sample needs the generic-container rule.
func TestAttachmentUpload_AcceptsTextAndOfficeFiles(t *testing.T) {
	cases := []struct {
		name string
		data func(t testing.TB) []byte
	}{
		{"notes.csv", func(testing.TB) []byte { return []byte("date,amount\n2026-11-01,12.00\n2026-11-02,8.50\n") }},
		{"notes.txt", func(testing.TB) []byte { return []byte("Signed for at the loading dock.\n") }},
		{"budget.xls", func(testing.TB) []byte { return oleBytes(excelCLSID) }},
		{"letter.doc", func(testing.TB) []byte { return oleBytes(wordCLSID) }},
		{"budget.xlsx", func(t testing.TB) []byte { return ooxmlBytes(t, "xl/") }},
		{"letter.docx", func(t testing.TB) []byte { return ooxmlBytes(t, "word/") }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ae := newAttachEnv(t)
			bill := ae.draftBill(t)
			req := ae.attach(t, "bill", bill.Id, c.name, c.data(t))
			req.want = http.StatusOK
			req.after = func(t testing.TB, app *tests.TestApp) {
				if got := onlyAttachment(t, app, "bill", bill.Id).GetString("name"); got != c.name {
					t.Errorf("name = %q, want %q", got, c.name)
				}
			}
			req.run(t, ae.app)
		})
	}
}

func TestAttachments_AreNeverChanged(t *testing.T) {
	t.Run("a PATCH", func(t *testing.T) {
		ae := newAttachEnv(t)
		row := mustStoreAttachment(t, ae.app, onBill(ae.draftBill(t).Id), "", "OSW-invoice-1002.pdf")
		apiReq{
			method: http.MethodPatch,
			url:    attachmentsURL + "/" + row.Id,
			token:  tokenFor(t, ae.users.bookkeeper),
			body:   `{"name":"renamed.pdf"}`,
			want:   http.StatusForbidden,
			after: func(t testing.TB, app *tests.TestApp) {
				if got := reload(t, app, "books_attachments", row.Id).GetString("name"); got != "OSW-invoice-1002.pdf" {
					t.Errorf("name = %q after a refused PATCH, want it unchanged", got)
				}
			},
		}.run(t, ae.app)
	})
	t.Run("a Go update", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.draftBill(t)
		other := ae.draftBill(t)
		row := mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
		for field, value := range map[string]any{"name": "renamed.pdf", "bill": other.Id} {
			fresh := reload(t, ae.app, "books_attachments", row.Id)
			fresh.Set(field, value)
			requireRefusalText(t, ae.app.Save(fresh), wantAttachmentNotChanged)
		}
		stored := reload(t, ae.app, "books_attachments", row.Id)
		if stored.GetString("name") != "OSW-invoice-1002.pdf" || stored.GetString("bill") != bill.Id {
			t.Errorf("row name %q bill %q after refused updates, want it unchanged", stored.GetString("name"), stored.GetString("bill"))
		}
	})
}

// PocketBase empties uploaded_by when the uploader is deleted: the one update
// besides the move that an attachment takes, and only when nothing else
// changes with it.
func TestAttachments_TheUploadersDeleteOnlyEmptiesUploadedBy(t *testing.T) {
	t.Run("the uploader is deleted", func(t *testing.T) {
		ae := newAttachEnv(t)
		uploader := mkUser(t, ae.app, "member")
		bill := ae.postedBill(t)
		parent := map[string]any{"bill": bill.Id, "uploaded_by": uploader.Id}
		row, err := storeAttachment(ae.app, parent, "", "OSW-invoice-1002.pdf", pdfBytes(1024))
		if err != nil {
			t.Fatalf("store attachment: %v", err)
		}
		if err := ae.app.Delete(uploader); err != nil {
			t.Fatalf("delete the uploader: %v", err)
		}
		stored := reload(t, ae.app, "books_attachments", row.Id)
		if got := stored.GetString("uploaded_by"); got != "" {
			t.Errorf("uploaded_by = %q after the uploader's delete, want empty", got)
		}
		if stored.GetString("name") != "OSW-invoice-1002.pdf" || stored.GetString("bill") != bill.Id {
			t.Errorf("row name %q bill %q after the uploader's delete, want it unchanged", stored.GetString("name"), stored.GetString("bill"))
		}
	})
	t.Run("emptied with another change", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.draftBill(t)
		parent := map[string]any{"bill": bill.Id, "uploaded_by": ae.users.bookkeeper.Id}
		row, err := storeAttachment(ae.app, parent, "", "OSW-invoice-1002.pdf", pdfBytes(1024))
		if err != nil {
			t.Fatalf("store attachment: %v", err)
		}
		fresh := reload(t, ae.app, "books_attachments", row.Id)
		fresh.Set("uploaded_by", "")
		fresh.Set("name", "renamed.pdf")
		requireRefusalText(t, ae.app.Save(fresh), wantAttachmentNotChanged)
		stored := reload(t, ae.app, "books_attachments", row.Id)
		if stored.GetString("name") != "OSW-invoice-1002.pdf" || stored.GetString("uploaded_by") != ae.users.bookkeeper.Id {
			t.Errorf("row name %q uploaded_by %q after a refused update, want it unchanged", stored.GetString("name"), stored.GetString("uploaded_by"))
		}
	})
}

// Delete draft removes the draft's attachments through the relation cascade;
// the delete-request guard does not run on the cascade.
func TestAttachments_DeleteDraftTakesTheFilesWithIt(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "OSW-invoice-1002.pdf")
	mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "packing-slip.pdf")
	apiReq{
		method: http.MethodDelete,
		url:    "/api/collections/books_bills/records/" + bill.Id,
		token:  tokenFor(t, ae.users.bookkeeper),
		want:   http.StatusNoContent,
		after: func(t testing.TB, app *tests.TestApp) {
			if _, err := app.FindRecordById("books_bills", bill.Id); err == nil {
				t.Error("the draft bill still exists after Delete draft")
			}
			requireAttachmentCount(t, app, "bill", bill.Id, 0)
		},
	}.run(t, ae.app)
}

// Two files added at once to a bill holding 24: the count and the write run
// in one transaction, so exactly one of them lands.
func TestRace_TwoAttachmentsAddedToABillHolding24(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.draftBill(t)
	for range 24 {
		mustStoreAttachment(t, ae.app, onBill(bill.Id), "", "page.pdf")
	}
	racing := bindRace(t, ae.app.OnRecordCreate("books_attachments"), func() error {
		_, err := storeAttachment(ae.app, onBill(bill.Id), "", "racing.pdf", pdfBytes(1024))
		return err
	})
	if _, err := storeAttachment(ae.app, onBill(bill.Id), "", "first.pdf", pdfBytes(1024)); err != nil {
		t.Fatalf("the 25th attachment: %v", err)
	}
	requireRefused(t, racing(), wantAttachmentBillLimit)
	requireAttachmentCount(t, ae.app, "bill", bill.Id, 25)
}
