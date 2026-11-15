package books

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/background"
	"tinycld.org/core/readonly"
	"tinycld.org/core/thumbnails"
)

// attachmentThumbnailTimeout bounds the render. Core's document render checks
// the context between rasterization steps; the blob read and the HEIF decode
// do not, so those steps are not cancelled by it.
const attachmentThumbnailTimeout = 60 * time.Second

// registerAttachmentThumbnails gives a stored attachment a generated JPEG
// thumbnail (spec §3.3, §4) when core renders its type: a HEIC or HEIF photo,
// a WebP, a PDF, an office document. PocketBase's own ?thumb= covers JPEG, PNG
// and GIF; any other type keeps its type icon. The render is slow, so it runs
// as a background job after the create commits, and the app's terminate waits
// for it.
func registerAttachmentThumbnails(app core.App) {
	jobs := background.For(app, "books")
	app.OnRecordAfterCreateSuccess(attachmentsCollection).BindFunc(func(e *core.RecordEvent) error {
		row := e.Record
		mime := attachmentTypeOf(row.GetString("name"))
		if thumbnails.CanGenerate(mime) {
			jobs.Run("books attachment thumbnail", func(ctx context.Context) {
				generateAttachmentThumbnail(ctx, app, row, mime)
			})
		}
		return e.Next()
	})
}

// attachmentTypeOf is the type of a stored name's extension. The row keeps no
// type, and the upload check admits only a name with a listed extension.
func attachmentTypeOf(name string) string {
	return attachmentExtensionTypes[strings.ToLower(filepath.Ext(name))]
}

// generateAttachmentThumbnail renders the stored file of row and stores the
// JPEG on it. A render that fails, or a row deleted meanwhile, logs a warning
// and leaves the row with no thumbnail, so it keeps its type icon.
func generateAttachmentThumbnail(ctx context.Context, app core.App, row *core.Record, mime string) {
	if ctx.Err() != nil {
		return
	}
	file := row.GetString("file")
	fsys, err := app.NewFilesystem()
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail: open the filesystem", "attachment", row.Id, "err", err)
		return
	}
	defer fsys.Close()
	blob, err := fsys.GetReader(row.BaseFilesPath() + "/" + file)
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail: read the stored file", "attachment", row.Id, "err", err)
		return
	}
	defer blob.Close()

	renderCtx, cancel := context.WithTimeout(ctx, attachmentThumbnailTimeout)
	defer cancel()
	var thumb bytes.Buffer
	err = thumbnails.Generate(renderCtx, &thumb, blob, mime, thumbnails.DefaultWidth, thumbnails.DefaultHeight)
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail: render", "attachment", row.Id, "mime", mime, "err", err)
		return
	}
	f, err := filesystem.NewFileFromBytes(thumb.Bytes(), strings.TrimSuffix(file, filepath.Ext(file))+"_thumb.jpg")
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail: make the file", "attachment", row.Id, "err", err)
		return
	}
	// The render is slow: a terminating app starts no new write.
	if ctx.Err() != nil {
		return
	}
	// The upload request was accepted, possibly just before the server went
	// read-only; a write during the mode is lost if the next build rolls back,
	// so the store waits for the mode to end, bounded by TailWait and ctx.
	waitCtx, stop := context.WithTimeout(ctx, readonly.TailWait)
	defer stop()
	err = readonly.WhenWritable(waitCtx, app, func() error {
		storeAttachmentThumbnail(ctx, app, row.Id, f)
		return nil
	})
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail dropped: the server stayed read-only past the wait",
			"attachment", row.Id, "err", err)
	}
}

// storeAttachmentThumbnail sets f on a fresh copy of the row, so a move made
// while the thumbnail rendered or waited is not undone. The update guard
// admits this one change (isThumbnailStored).
func storeAttachmentThumbnail(ctx context.Context, app core.App, id string, f *filesystem.File) {
	fresh, err := app.FindRecordById(attachmentsCollection, id)
	if err != nil {
		log.WarnContext(ctx, "attachment thumbnail: the attachment is gone", "attachment", id, "err", err)
		return
	}
	fresh.Set("thumbnail", f)
	if err := app.Save(fresh); err != nil {
		log.WarnContext(ctx, "attachment thumbnail: store", "attachment", id, "err", err)
	}
}
