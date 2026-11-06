package books

import "github.com/pocketbase/pocketbase/core"

// documentKind is one kind of printed document, the {kind} in
// /api/books/pdf/{kind}[/{id}].
type documentKind struct {
	// Collection is the collection the document prints a record of; the route
	// checks that record's view rule. "" is a kind printed from no record,
	// served at /api/books/pdf/{kind} with no id.
	Collection string
	// Build makes the document; record is nil when Collection is "".
	Build func(app core.App, record *core.Record) (pdfDocument, error)
	// FileName names the download, without ".pdf"; the route sanitizes it.
	FileName func(doc pdfDocument) string
}

// documentKinds are the documents Books prints. A unit that prints a record
// (invoice, estimate, statement, report export) adds its kind here.
var documentKinds = map[string]documentKind{
	"sample": {
		Build:    buildSampleDocument,
		FileName: func(pdfDocument) string { return "sample-invoice" },
	},
}
