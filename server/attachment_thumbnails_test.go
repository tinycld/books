package books

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math/rand/v2"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/hook"

	"tinycld.org/core/thumbnails"
)

// Attachment thumbnails (spec §3.3, §4; revise 1): every type core
// thumbnails.CanGenerate accepts gets a generated JPEG in the row's
// `thumbnail` field, made by a background job after the create commits.
// PocketBase's own ?thumb= covers JPEG, PNG and GIF; the rest keep the type
// icon.

// testFile reads a sample from server/testdata.
func testFile(t testing.TB, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read testdata/%s: %v", name, err)
	}
	return data
}

// heicBytes is a real 64 x 48 HEIC still (core thumbnails' own sample).
func heicBytes(t testing.TB) []byte { return testFile(t, "sips-quad-64x48.heic") }

// onePagePDF is the seed's one-page PDF (lib/attachment-seed-files.ts), a
// real page core renders, unlike pdfBytes' bare header.
func onePagePDF(t testing.TB) []byte { return testFile(t, "attachment-page.pdf") }

// requireCoreRenders guards the sample: when core itself cannot render it, the
// test's failure would say nothing about Books.
func requireCoreRenders(t testing.TB, data []byte, mime string) {
	t.Helper()
	if !thumbnails.CanGenerate(mime) {
		t.Fatalf("core cannot thumbnail %s", mime)
	}
	if err := thumbnails.Generate(context.Background(), io.Discard, bytes.NewReader(data), mime,
		thumbnails.DefaultWidth, thumbnails.DefaultHeight); err != nil {
		t.Fatalf("core cannot render the %s sample: %v", mime, err)
	}
}

// attachmentNamed is the one row of the parent with that upload name.
func attachmentNamed(t testing.TB, app core.App, column, id, name string) *core.Record {
	t.Helper()
	for _, row := range attachmentsOn(t, app, column, id) {
		if row.GetString("name") == name {
			return row
		}
	}
	t.Fatalf("no attachment %s on %s %s", name, column, id)
	return nil
}

// waitForThumbnail waits for the background job to store the row's thumbnail
// and returns the row as stored then.
func waitForThumbnail(t testing.TB, app core.App, id string) *core.Record {
	t.Helper()
	var row *core.Record
	waitFor(t, func() bool {
		row = reload(t, app, "books_attachments", id)
		return row.GetString("thumbnail") != ""
	})
	return row
}

// requireJPEGThumbnail decodes the stored thumbnail: a JPEG inside core's
// 480 x 360 box.
func requireJPEGThumbnail(t testing.TB, app core.App, row *core.Record) {
	t.Helper()
	thumb := row.GetString("thumbnail")
	if thumb == row.GetString("file") {
		t.Fatalf("thumbnail %q is the attached file itself", thumb)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("open the filesystem: %v", err)
	}
	defer fsys.Close()
	r, err := fsys.GetReader(row.BaseFilesPath() + "/" + thumb)
	if err != nil {
		t.Fatalf("read the stored thumbnail %s: %v", thumb, err)
	}
	defer r.Close()
	img, format, err := image.Decode(r)
	if err != nil {
		t.Fatalf("decode the stored thumbnail %s: %v", thumb, err)
	}
	if format != "jpeg" {
		t.Errorf("thumbnail format = %q, want jpeg", format)
	}
	b := img.Bounds()
	if b.Dx() == 0 || b.Dy() == 0 || b.Dx() > thumbnails.DefaultWidth || b.Dy() > thumbnails.DefaultHeight {
		t.Errorf("thumbnail is %d x %d, want a non-empty image inside %d x %d",
			b.Dx(), b.Dy(), thumbnails.DefaultWidth, thumbnails.DefaultHeight)
	}
}

// jpegBytes is a small real JPEG, as the thumbnail job stores.
func jpegBytes(t testing.TB, w, h int, noisy bool) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	rng := rand.New(rand.NewPCG(1, 2))
	for y := range h {
		for x := range w {
			c := color.RGBA{R: 40, G: 120, B: 200, A: 255}
			if noisy {
				c = color.RGBA{R: uint8(rng.IntN(256)), G: uint8(rng.IntN(256)), B: uint8(rng.IntN(256)), A: 255}
			}
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatalf("encode a JPEG: %v", err)
	}
	return buf.Bytes()
}

func thumbnailFile(t testing.TB, name string) *filesystem.File {
	t.Helper()
	f, err := filesystem.NewFileFromBytes(jpegBytes(t, 8, 8, false), name)
	if err != nil {
		t.Fatalf("make the thumbnail file: %v", err)
	}
	return f
}

func TestAttachments_ThumbnailField(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId("books_attachments")
	if err != nil {
		t.Fatalf("find books_attachments: %v", err)
	}
	field, ok := col.Fields.GetByName("thumbnail").(*core.FileField)
	if !ok {
		t.Fatalf("books_attachments.thumbnail is %T, want *core.FileField", col.Fields.GetByName("thumbnail"))
	}
	if field.Required || field.MaxSelect != 1 || !field.Protected {
		t.Errorf("thumbnail required=%v maxSelect=%d protected=%v, want false 1 true",
			field.Required, field.MaxSelect, field.Protected)
	}
	if !reflect.DeepEqual(field.MimeTypes, []string{"image/jpeg"}) {
		t.Errorf("thumbnail mimeTypes = %v, want [image/jpeg]", field.MimeTypes)
	}
	// Core Thumbnail asks ?thumb=40x40 of the thumbnail file too.
	if !reflect.DeepEqual(field.Thumbs, []string{"40x40"}) {
		t.Errorf("thumbnail thumbs = %v, want [40x40]", field.Thumbs)
	}
	// A 480 x 360 JPEG of noise at core's quality is about the largest render.
	if worst := len(jpegBytes(t, thumbnails.DefaultWidth, thumbnails.DefaultHeight, true)); field.MaxSize < int64(worst) {
		t.Errorf("thumbnail maxSize = %d, want room for a %d-byte 480 x 360 JPEG", field.MaxSize, worst)
	}
}

// A HEIC photo (an iPhone's camera) and a PDF (a vendor's bill) are drawn by
// core, not by PocketBase's ?thumb=, so the row gets a generated thumbnail.
func TestAttachmentUpload_GetsAGeneratedThumbnail(t *testing.T) {
	cases := []struct {
		name string
		mime string
		data func(testing.TB) []byte
	}{
		{"meter-photo.heic", "image/heic", heicBytes},
		{"OSW-invoice-1002.pdf", "application/pdf", onePagePDF},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			data := c.data(t)
			requireCoreRenders(t, data, c.mime)
			ae := newAttachEnv(t)
			bill := ae.postedBill(t)
			req := ae.attach(t, "bill", bill.Id, c.name, data)
			req.want = http.StatusOK
			req.after = func(t testing.TB, app *tests.TestApp) {
				row := onlyAttachment(t, app, "bill", bill.Id)
				stored := waitForThumbnail(t, app, row.Id)
				requireJPEGThumbnail(t, app, stored)
				if stored.GetString("file") != row.GetString("file") || stored.GetString("name") != c.name {
					t.Errorf("file %q name %q after the thumbnail, want the upload's %q %q unchanged",
						stored.GetString("file"), stored.GetString("name"), row.GetString("file"), c.name)
				}
			}
			req.run(t, ae.app)
		})
	}
}

// Core draws no page for plain text, so a .txt keeps its type icon. The PDF
// uploaded after it is the sentinel: once its thumbnail is stored, a job for
// the .txt (started first) has had its turn.
func TestAttachmentUpload_ATextFileGetsNoThumbnail(t *testing.T) {
	ae := newAttachEnv(t)
	bill := ae.postedBill(t)
	txt := ae.attach(t, "bill", bill.Id, "notes.txt", []byte("Signed for at the loading dock.\n"))
	txt.want = http.StatusOK
	txt.run(t, ae.app)
	pdf := ae.attach(t, "bill", bill.Id, "OSW-invoice-1002.pdf", onePagePDF(t))
	pdf.want = http.StatusOK
	pdf.after = func(t testing.TB, app *tests.TestApp) {
		waitForThumbnail(t, app, attachmentNamed(t, app, "bill", bill.Id, "OSW-invoice-1002.pdf").Id)
		note := attachmentNamed(t, app, "bill", bill.Id, "notes.txt")
		if got := reload(t, app, "books_attachments", note.Id).GetString("thumbnail"); got != "" {
			t.Errorf("notes.txt has thumbnail %q, want none", got)
		}
	}
	pdf.run(t, ae.app)
}

// attachWithThumbnail is the writer's multipart create of one file that also
// sends its own `thumbnail` file part, as a client could; after runs once the
// create answered 200.
func attachWithThumbnail(t *testing.T, ae *attachEnv, column, id, name string, data, thumb []byte,
	after func(t testing.TB, app *tests.TestApp)) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField(column, id); err != nil {
		t.Fatal(err)
	}
	for _, part := range []struct {
		field, name string
		data        []byte
	}{{"file", name, data}, {"thumbnail", "client-thumb.jpg", thumb}} {
		fw, err := w.CreateFormFile(part.field, part.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := fw.Write(part.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	scenario := &tests.ApiScenario{
		Name:   "attach " + name + " with a client thumbnail",
		Method: http.MethodPost,
		URL:    attachmentsURL,
		Body:   bytes.NewReader(body.Bytes()),
		Headers: map[string]string{
			"Content-Type":  w.FormDataContentType(),
			"Authorization": tokenFor(t, ae.users.bookkeeper),
		},
		ExpectedStatus:        http.StatusOK,
		ExpectedContent:       []string{`"name":"` + name + `"`},
		TestAppFactory:        func(testing.TB) *tests.TestApp { return ae.app },
		DisableTestAppCleanup: true,
		AfterTestFunc:         func(t testing.TB, app *tests.TestApp, _ *http.Response) { after(t, app) },
	}
	scenario.Test(t)
}

// storedBlobs are the keys of every blob stored under the row's files path.
func storedBlobs(t testing.TB, app core.App, row *core.Record) []string {
	t.Helper()
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("open the filesystem: %v", err)
	}
	defer fsys.Close()
	objects, err := fsys.List(row.BaseFilesPath() + "/")
	if err != nil {
		t.Fatalf("list the row's blobs: %v", err)
	}
	keys := make([]string, 0, len(objects))
	for _, o := range objects {
		keys = append(keys, o.Key)
	}
	return keys
}

// storedThumbnailBytes reads the row's stored thumbnail blob.
func storedThumbnailBytes(t testing.TB, app core.App, row *core.Record) []byte {
	t.Helper()
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("open the filesystem: %v", err)
	}
	defer fsys.Close()
	r, err := fsys.GetReader(row.BaseFilesPath() + "/" + row.GetString("thumbnail"))
	if err != nil {
		t.Fatalf("read the stored thumbnail: %v", err)
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read the stored thumbnail: %v", err)
	}
	return data
}

// The thumbnail is one the server generates (spec §4): a thumbnail the client
// sends with its create is dropped, so a .txt draws no client image and no
// unmetered blob is stored.
func TestAttachmentUpload_DropsAClientThumbnail(t *testing.T) {
	t.Run("a text file keeps no thumbnail", func(t *testing.T) {
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		attachWithThumbnail(t, ae, "bill", bill.Id, "notes.txt", []byte("Signed for at the loading dock.\n"),
			jpegBytes(t, 8, 8, false), func(t testing.TB, app *tests.TestApp) {
				row := onlyAttachment(t, app, "bill", bill.Id)
				if got := row.GetString("thumbnail"); got != "" {
					t.Errorf("notes.txt stored with thumbnail %q, want none", got)
				}
				want := row.BaseFilesPath() + "/" + row.GetString("file")
				if got := storedBlobs(t, app, row); !reflect.DeepEqual(got, []string{want}) {
					t.Errorf("blobs stored for notes.txt = %v, want only the file %s", got, want)
				}
			})
	})
	t.Run("a HEIC photo ends with the generated thumbnail", func(t *testing.T) {
		data := heicBytes(t)
		requireCoreRenders(t, data, "image/heic")
		client := jpegBytes(t, 8, 8, false)
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		attachWithThumbnail(t, ae, "bill", bill.Id, "meter-photo.heic", data, client,
			func(t testing.TB, app *tests.TestApp) {
				row := onlyAttachment(t, app, "bill", bill.Id)
				var stored *core.Record
				waitFor(t, func() bool {
					stored = reload(t, app, "books_attachments", row.Id)
					return stored.GetString("thumbnail") != "" &&
						!bytes.Equal(storedThumbnailBytes(t, app, stored), client)
				})
				requireJPEGThumbnail(t, app, stored)
				want := []string{
					stored.BaseFilesPath() + "/" + stored.GetString("file"),
					stored.BaseFilesPath() + "/" + stored.GetString("thumbnail"),
				}
				got := storedBlobs(t, app, stored)
				slices.Sort(want)
				slices.Sort(got)
				if !reflect.DeepEqual(got, want) {
					t.Errorf("blobs stored for meter-photo.heic = %v, want the file and the generated thumbnail %v", got, want)
				}
			})
	})
}

// The update guard admits the job's one write, the thumbnail stored where
// there was none, and refuses every other change.
func TestAttachments_OnlyTheThumbnailStoreChangesARow(t *testing.T) {
	store := func(t *testing.T) (*attachEnv, *core.Record) {
		t.Helper()
		ae := newAttachEnv(t)
		bill := ae.postedBill(t)
		row, err := storeAttachment(ae.app, onBill(bill.Id), "", "notes.txt", []byte("Signed for at the loading dock.\n"))
		if err != nil {
			t.Fatalf("store notes.txt: %v", err)
		}
		return ae, row
	}
	t.Run("the thumbnail stored where there was none", func(t *testing.T) {
		ae, row := store(t)
		fresh := reload(t, ae.app, "books_attachments", row.Id)
		fresh.Set("thumbnail", thumbnailFile(t, "notes_thumb.jpg"))
		if err := ae.app.Save(fresh); err != nil {
			t.Fatalf("store the thumbnail: %v", err)
		}
		stored := reload(t, ae.app, "books_attachments", row.Id)
		if !strings.HasSuffix(stored.GetString("thumbnail"), ".jpg") {
			t.Errorf("thumbnail = %q after the store, want the stored JPEG", stored.GetString("thumbnail"))
		}
		if stored.GetString("name") != "notes.txt" || stored.GetString("file") != row.GetString("file") {
			t.Errorf("name %q file %q after the store, want them unchanged", stored.GetString("name"), stored.GetString("file"))
		}
	})
	t.Run("a second thumbnail over the first", func(t *testing.T) {
		ae, row := store(t)
		first := reload(t, ae.app, "books_attachments", row.Id)
		first.Set("thumbnail", thumbnailFile(t, "notes_thumb.jpg"))
		if err := ae.app.Save(first); err != nil {
			t.Fatalf("store the first thumbnail: %v", err)
		}
		kept := reload(t, ae.app, "books_attachments", row.Id).GetString("thumbnail")
		again := reload(t, ae.app, "books_attachments", row.Id)
		again.Set("thumbnail", thumbnailFile(t, "other_thumb.jpg"))
		requireRefusalText(t, ae.app.Save(again), wantAttachmentNotChanged)
		if got := reload(t, ae.app, "books_attachments", row.Id).GetString("thumbnail"); got != kept {
			t.Errorf("thumbnail = %q after a refused replace, want %q", got, kept)
		}
	})
	t.Run("the thumbnail with another change", func(t *testing.T) {
		ae, row := store(t)
		fresh := reload(t, ae.app, "books_attachments", row.Id)
		fresh.Set("thumbnail", thumbnailFile(t, "notes_thumb.jpg"))
		fresh.Set("name", "renamed.txt")
		requireRefusalText(t, ae.app.Save(fresh), wantAttachmentNotChanged)
		stored := reload(t, ae.app, "books_attachments", row.Id)
		if stored.GetString("name") != "notes.txt" || stored.GetString("thumbnail") != "" {
			t.Errorf("name %q thumbnail %q after a refused update, want notes.txt and none",
				stored.GetString("name"), stored.GetString("thumbnail"))
		}
	})
	t.Run("any other change alone", func(t *testing.T) {
		ae, row := store(t)
		fresh := reload(t, ae.app, "books_attachments", row.Id)
		fresh.Set("name", "renamed.txt")
		requireRefusalText(t, ae.app.Save(fresh), wantAttachmentNotChanged)
	})
}

// The thumbnail store and the correction's move each save the attachment row
// (revise 1; cp4 fix 1). The move runs in the posting's transaction, which
// holds PocketBase's one write connection until it commits; the thumbnail job
// runs in the background. The store must not write back the parent it read
// before that commit: the row ends on the correction with its thumbnail.

// interleaveEnv is a text attachment (core renders no thumbnail for it, so no
// background job writes the row) on a bill, and a second bill it moves to.
func interleaveEnv(t *testing.T) (ae *attachEnv, row *core.Record, from, to string) {
	t.Helper()
	ae = newAttachEnv(t)
	original := ae.draftBill(t)
	correction := ae.draftBill(t)
	row, err := storeAttachment(ae.app, onBill(original.Id), "", "notes.txt", []byte("Signed for at the loading dock.\n"))
	if err != nil {
		t.Fatalf("store notes.txt: %v", err)
	}
	return ae, row, original.Id, correction.Id
}

// requireMovedWithThumbnail checks the row sits on the correction, the
// original holds none, and the stored thumbnail is still there.
func requireMovedWithThumbnail(t *testing.T, app core.App, id, from, to string) {
	t.Helper()
	stored := reload(t, app, "books_attachments", id)
	if got := stored.GetString("bill"); got != to {
		t.Errorf("bill = %q after the move and the thumbnail store, want the correction %q (the original is %q)", got, to, from)
	}
	requireAttachmentCount(t, app, "bill", from, 0)
	if stored.GetString("thumbnail") == "" {
		t.Errorf("thumbnail is empty after the move and the thumbnail store, want the stored JPEG")
		return
	}
	requireJPEGThumbnail(t, app, stored)
}

// writeConnWaits is how many times a request for PocketBase's one write
// connection has had to wait for it so far.
func writeConnWaits(t *testing.T, app core.App) int64 {
	t.Helper()
	db, ok := app.NonconcurrentDB().(*dbx.DB)
	if !ok {
		t.Fatalf("the write connection is %T, want *dbx.DB", app.NonconcurrentDB())
	}
	return db.DB().Stats().WaitCount
}

// The thumbnail job stores its thumbnail while a correction's posting holds
// the move open in its transaction. The store must not read the row as it was
// before the move commits and then write that parent back after it: the row
// ends on the correction with its thumbnail.
func TestAttachmentThumbnail_AStoreDuringAnOpenMoveKeepsBoth(t *testing.T) {
	ae, row, from, to := interleaveEnv(t)

	// The store's save reached its last update hook: whatever it read for the
	// row, it read it by now, and only the write itself is left.
	reachedWrite := make(chan struct{}, 1)
	ae.app.OnRecordUpdate(attachmentsCollection).Bind(&hook.Handler[*core.RecordEvent]{
		Priority: 1000,
		Func: func(e *core.RecordEvent) error {
			if len(e.Record.GetUnsavedFiles("thumbnail")) == 1 {
				select {
				case reachedWrite <- struct{}{}:
				default:
				}
			}
			return e.Next()
		},
	})

	moved := make(chan struct{})
	release := make(chan struct{})
	moveDone := make(chan error, 1)
	go func() {
		moveDone <- ae.app.RunInTransaction(func(tx core.App) error {
			if err := moveAttachments(tx, "bill", from, to); err != nil {
				return err
			}
			close(moved)
			<-release
			return nil
		})
	}()
	select {
	case <-moved:
	case err := <-moveDone:
		t.Fatalf("the move ended before it was held open: %v", err)
	}

	// The move is saved in its transaction and not committed. The store starts
	// now; it is held as soon as it needs the write connection the move holds.
	waits := writeConnWaits(t, ae.app)
	thumb := thumbnailFile(t, "notes_thumb.jpg")
	storeDone := make(chan struct{})
	go func() {
		storeAttachmentThumbnail(context.Background(), ae.app, row.Id, thumb)
		close(storeDone)
	}()
	held := false
	deadline := time.After(5 * time.Second)
	for !held {
		select {
		case <-reachedWrite:
			held = true
		case <-storeDone:
			held = true
		case <-deadline:
			close(release)
			t.Fatal("the thumbnail store neither waited for the write connection nor reached its write within 5 s")
		default:
			held = writeConnWaits(t, ae.app) > waits
			if !held {
				time.Sleep(time.Millisecond)
			}
		}
	}

	close(release)
	if err := <-moveDone; err != nil {
		t.Fatalf("move the attachment: %v", err)
	}
	select {
	case <-storeDone:
	case <-time.After(5 * time.Second):
		t.Fatal("the thumbnail store did not end within 5 s after the move committed")
	}

	requireMovedWithThumbnail(t, ae.app, row.Id, from, to)
}
