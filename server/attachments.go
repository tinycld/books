// Attachments are the files a writer keeps with a bill, an expense or a vendor
// credit (the vendor's bill, a receipt, the vendor's credit note), and the
// files of a custom File field on those forms (books_attachments, 2100000020;
// the vendor_credit parent, 2100000023). The rules decide who may
// act; the hooks here decide whether the write is valid.

package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/core/validators"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const (
	attachmentsCollection = "books_attachments"
	// maxAttachmentBytes is the file field's maxSize in 2100000020, checked
	// here first so the refusal is a message the client keeps.
	maxAttachmentBytes = 20 << 20
	// maxAttachmentsPerDocument counts every row of a document: the
	// Attachments section's and its custom File fields'.
	maxAttachmentsPerDocument = 25
	// attachmentMoveMark marks a row that moveAttachments re-points, the one
	// update an attachment takes.
	attachmentMoveMark = "attachment-move"
)

// attachmentMimeTypes is the file field's mimeTypes list in 2100000020. HTML,
// SVG and executables are not on it, because a stored file opens from the
// app's own origin. TestAttachments_Schema fails when the two drift.
var attachmentMimeTypes = []string{
	"application/pdf",
	"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
	"text/plain", "text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

// attachmentExtensionTypes are the file name extensions of the allow-list's
// types, compared lower-cased, and the type of each; the client keeps the
// same list (ATTACHMENT_EXTENSIONS) for a file that reports no type. The row
// keeps no type, so the thumbnail job reads a stored file's type from here.
var attachmentExtensionTypes = map[string]string{
	".pdf":  "application/pdf",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".heic": "image/heic",
	".heif": "image/heif",
	".txt":  "text/plain",
	".csv":  "text/csv",
	".xls":  "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".doc":  "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

// Refusal texts of the attachment guards. The client shows the size, type,
// limit and void texts with the same words. Each ends with a period, so
// PocketBase adds none; a text that starts with a file name goes through
// refuseNamed, which keeps the name as it was uploaded.
const (
	msgAttachmentTooLarge     = "%s is larger than 20 MB."
	msgAttachmentType         = "%s is not a file type Books keeps. Attach a PDF, an image, or an office or text file."
	msgAttachmentBillLimit    = "A bill holds at most 25 attachments."
	msgAttachmentExpenseLimit = "An expense holds at most 25 attachments."
	msgAttachmentVCLimit      = "A vendor credit holds at most 25 attachments."
	msgAttachmentBillVoid     = "This bill is void. Its attachments can't change."
	msgAttachmentExpenseVoid  = "This expense is void. Its attachments can't change."
	msgAttachmentVCVoid       = "This vendor credit is void. Its attachments can't change."
	msgAttachmentOneParent    = "An attachment belongs to one bill, one expense or one vendor credit."
	msgAttachmentNotChanged   = "An attachment is not changed. Remove it and attach the file again."
)

// attachmentParentFields are the fields of an attachment that name its
// document, one per parent kind.
var attachmentParentFields = []string{"bill", "expense", "vendor_credit"}

// attachmentTexts are the void and limit refusals of a parent kind.
func attachmentTexts(kind salesDocKind) (void, limit string) {
	switch kind.Collection {
	case expensesCollection:
		return msgAttachmentExpenseVoid, msgAttachmentExpenseLimit
	case vendorCreditsCollection:
		return msgAttachmentVCVoid, msgAttachmentVCLimit
	}
	return msgAttachmentBillVoid, msgAttachmentBillLimit
}

// registerAttachments binds the attachment hooks.
//
// The create-request hook checks and stamps the upload: it reads the request's
// file and user, which exist only on a request. The create guard is a model
// hook inside serialized, so a Go caller's create is checked too, and the
// count and the write run in one transaction: two uploads at once cannot both
// pass a count of 24.
//
// The delete guard is a request hook, because Delete draft removes the draft's
// attachments through the relation cascade, which runs the model hooks and not
// the request hooks: a model hook would refuse the cascade of a draft the
// guard has no reason to stop.
//
// An attachment never changes. The update guard lets through only Books' own
// move of a corrected document's files (moveAttachments), PocketBase's
// clearing of the uploader when that user is deleted, and the thumbnail job's
// store of a generated thumbnail on a row that has none
// (registerAttachmentThumbnails).
func registerAttachments(app core.App) {
	app.OnRecordCreateRequest(attachmentsCollection).BindFunc(stampAttachmentUpload)
	app.OnRecordCreate(attachmentsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkAttachmentCreate(tx, e.Record) })
	})
	app.OnRecordDeleteRequest(attachmentsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		return serializedRequest(e, func(tx core.App) error { return checkAttachmentDelete(tx, e.Record) })
	})
	app.OnRecordUpdate(attachmentsCollection).BindFunc(func(e *core.RecordEvent) error {
		if hasTxMark(e.App, attachmentMoveMark, e.Record.Id) || isUploaderCleared(e.Record) || isThumbnailStored(e.Record) {
			return e.Next()
		}
		return refuse(msgAttachmentNotChanged)
	})
	registerAttachmentThumbnails(app)
}

// stampAttachmentUpload checks an uploaded file's size and type and stamps
// what the row says about it, whatever the client sent. It runs before
// PocketBase's own field validation, because core's uploadRecordWithFile keeps
// only a response's top-level message: the schema's maxSize or mimeTypes error
// would reach the person as "Failed to create record.". A missing file is left
// to the schema's required rule.
func stampAttachmentUpload(e *core.RecordRequestEvent) error {
	if files := e.Record.GetUnsavedFiles("file"); len(files) > 0 {
		f := files[0]
		if err := checkAttachmentUpload(f); err != nil {
			return err
		}
		e.Record.Set("name", truncateRunes(f.OriginalName, 255))
		e.Record.Set("size", f.Size)
	}
	// The thumbnail is one the server generates; a client's own image would draw
	// for any file type and sit outside the quota, so it is dropped for everyone.
	e.Record.Set("thumbnail", "")
	// A superuser keeps the uploader it sent, which the seed uses.
	stampActor(e.Record, "uploaded_by", e.Auth)
	return e.Next()
}

// checkAttachmentUpload refuses a file over the limit, and a file whose name
// has no allow-listed extension or whose bytes are not an allow-listed type
// (PocketBase's own detection, as the schema's mimeTypes check reads it). The
// server has no type the client reported, and a renamed executable has a
// .pdf name, so both the name and the bytes are checked.
func checkAttachmentUpload(f *filesystem.File) error {
	if f.Size > maxAttachmentBytes {
		return refuseNamed(msgAttachmentTooLarge, f.OriginalName)
	}
	if attachmentTypeOf(f.OriginalName) == "" {
		return refuseNamed(msgAttachmentType, f.OriginalName)
	}
	if validators.UploadedFileMimeType(attachmentMimeTypes)(f) != nil {
		return refuseNamed(msgAttachmentType, f.OriginalName)
	}
	return nil
}

// attachmentParent is the kind and the row of the document r belongs to,
// refusing a row that names more than one of a bill, an expense and a vendor
// credit, or none.
func attachmentParent(tx core.App, r *core.Record) (kind salesDocKind, parent *core.Record, err error) {
	set := 0
	for _, field := range attachmentParentFields {
		if r.GetString(field) != "" {
			set++
		}
	}
	switch {
	case set != 1:
		return salesDocKind{}, nil, refuse(msgAttachmentOneParent)
	case r.GetString("bill") != "":
		kind = billKind
	case r.GetString("expense") != "":
		kind = expenseKind
	default:
		kind = vendorCreditKind
	}
	parent, err = tx.FindRecordById(kind.Collection, r.GetString(kind.ParentField))
	if err != nil {
		return kind, nil, err
	}
	return kind, parent, nil
}

// checkAttachmentCreate refuses a row with no single parent, a row on a void
// document, and the 26th row of a document. A correction counts the rows of
// the document it replaces too, because they move to it when it posts; for
// the same reason a document counts the rows of each draft correction that
// replaces it. The move itself never refuses: an attachment does not block
// Post.
func checkAttachmentCreate(tx core.App, r *core.Record) error {
	kind, parent, err := attachmentParent(tx, r)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a parent that does not exist.
		return nil
	}
	if err != nil {
		return err
	}
	void, limit := attachmentTexts(kind)
	if parent.GetString("status") == statusVoid {
		return refuse("%s", void)
	}
	count, err := tx.CountRecords(attachmentsCollection, dbx.HashExp{kind.ParentField: parent.Id})
	if err != nil {
		return fmt.Errorf("books: count the document's attachments: %w", err)
	}
	if replaces := parent.GetString("replaces"); replaces != "" {
		moving, err := tx.CountRecords(attachmentsCollection, dbx.HashExp{kind.ParentField: replaces})
		if err != nil {
			return fmt.Errorf("books: count the replaced document's attachments: %w", err)
		}
		count += moving
	}
	corrections, err := tx.FindAllRecords(kind.Collection, dbx.HashExp{"replaces": parent.Id, "status": statusDraft})
	if err != nil {
		return fmt.Errorf("books: read the document's draft corrections: %w", err)
	}
	for _, correction := range corrections {
		pending, err := tx.CountRecords(attachmentsCollection, dbx.HashExp{kind.ParentField: correction.Id})
		if err != nil {
			return fmt.Errorf("books: count a draft correction's attachments: %w", err)
		}
		count += pending
	}
	if count >= maxAttachmentsPerDocument {
		return refuse("%s", limit)
	}
	return nil
}

// checkAttachmentDelete refuses to remove a void document's file. A row whose
// document is gone passes.
func checkAttachmentDelete(tx core.App, r *core.Record) error {
	kind, parent, err := attachmentParent(tx, r)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if parent.GetString("status") == statusVoid {
		void, _ := attachmentTexts(kind)
		return refuse("%s", void)
	}
	return nil
}

// isUploaderCleared reports whether an update only empties uploaded_by:
// PocketBase's unset of the relation when the uploading user is deleted.
// Every other column is as stored.
func isUploaderCleared(r *core.Record) bool {
	return isStoredFile(r) && isThumbnailKept(r) && r.GetString("uploaded_by") == ""
}

// isThumbnailStored reports whether an update only sets the thumbnail where
// there was none: the thumbnail job's one write. A second thumbnail over the
// first, or a thumbnail with any other change, is not admitted.
func isThumbnailStored(r *core.Record) bool {
	stored := r.Original()
	return stored.GetString("thumbnail") == "" &&
		len(r.GetUnsavedFiles("thumbnail")) == 1 &&
		isStoredFile(r) &&
		r.GetString("uploaded_by") == stored.GetString("uploaded_by")
}

// isStoredFile reports whether the parent, the field, the file, its name and
// its size are as stored.
func isStoredFile(r *core.Record) bool {
	stored := r.Original()
	for _, field := range append(slices.Clone(attachmentParentFields), "field", "file", "name") {
		if r.GetString(field) != stored.GetString(field) {
			return false
		}
	}
	return r.GetInt("size") == stored.GetInt("size")
}

// isThumbnailKept reports whether an update leaves the thumbnail as stored.
func isThumbnailKept(r *core.Record) bool {
	return len(r.GetUnsavedFiles("thumbnail")) == 0 && r.GetString("thumbnail") == r.Original().GetString("thumbnail")
}

// moveAttachments re-points every row whose parentField is from to to: the
// files of a corrected bill, expense or vendor credit move to its correction when the
// correction posts (spec §3.6). The rows keep their ids and stored files. It
// runs in tx's transaction (the posting's), or in its own when tx has none,
// so the move commits with the post or not at all.
func moveAttachments(tx core.App, parentField, from, to string) error {
	return tx.RunInTransaction(func(tx core.App) error {
		rows, err := tx.FindAllRecords(attachmentsCollection, dbx.HashExp{parentField: from})
		if err != nil {
			return fmt.Errorf("books: read the attachments to move: %w", err)
		}
		for _, r := range rows {
			r.Set(parentField, to)
			done := setTxMark(tx, attachmentMoveMark, r.Id)
			err := tx.Save(r)
			done()
			if err != nil {
				return fmt.Errorf("books: move %s to the correction: %w", r.GetString("name"), err)
			}
		}
		return nil
	})
}

// attachmentLabel names an attachment in the audit log by its file and its
// document: "Attachment receipt.jpg on Bill 1003", "Attachment receipt.jpg on
// Draft expense". A document that cannot be read (the cascade of Delete draft
// removed it first) gives "Attachment receipt.jpg", so the audit row is still
// written.
func attachmentLabel(app core.App, r *core.Record) string {
	label := "Attachment " + r.GetString("name")
	if id := r.GetString("bill"); id != "" {
		if bill, err := app.FindRecordById(billKind.Collection, id); err == nil {
			return label + " on " + billLabel(bill)
		}
		return label
	}
	if id := r.GetString("expense"); id != "" {
		if expense, err := app.FindRecordById(expenseKind.Collection, id); err == nil {
			return label + " on " + expenseLabel(expense)
		}
		return label
	}
	if id := r.GetString("vendor_credit"); id != "" {
		if credit, err := app.FindRecordById(vendorCreditsCollection, id); err == nil {
			return label + " on " + vendorCreditLabel(credit)
		}
	}
	return label
}
