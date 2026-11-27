package books

import (
	"encoding/json"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The Go twin of tests/document-kind-registries.test.ts. A new document kind (a new
// entry in cli/documents.json, the one definition of the transaction types) must
// reach each server and CLI table keyed by kind. Each table below lists every kind,
// or names it in the table's exclusions with the reason. An excluded kind that the
// table lists fails too, so an exclusion is removed when its kind is added.

type registryLine struct {
	Collection string `json:"collection"`
	Parent     string `json:"parent"`
}

type registryField struct {
	Name string   `json:"name"`
	Enum []string `json:"enum"`
}

type registryDocument struct {
	Name       string            `json:"name"`
	Collection string            `json:"collection"`
	Lifecycle  string            `json:"lifecycle"`
	Fixed      map[string]string `json:"fixed"`
	Fields     []registryField   `json:"fields"`
	Lines      []registryLine    `json:"lines"`
}

// key is the kind's doc type: the fixed doc type of an entry kind (journal,
// transfer), else the collection's name without its prefix, in the singular.
func (d registryDocument) key() string {
	if docType := d.Fixed["doc_type"]; docType != "" {
		return docType
	}
	return strings.TrimSuffix(strings.TrimPrefix(d.Collection, "books_"), "s")
}

func loadRegistryDocuments(t *testing.T) []registryDocument {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "cli", "documents.json"))
	if err != nil {
		t.Fatalf("read cli/documents.json: %v", err)
	}
	var file struct {
		Documents []registryDocument `json:"documents"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse cli/documents.json: %v", err)
	}
	if len(file.Documents) == 0 {
		t.Fatal("cli/documents.json holds no document")
	}
	return file.Documents
}

const (
	// The kind is the unit's work in progress: move it into the table when its part is built.
	adjustmentPending = "p7-inventory-adjust builds the inventory adjustment's screens"
	neverPosts        = "it never posts, so no entry carries its doc type"
	entryIsDocument   = "the entry is the document: entryHref opens entries/ or transfers/ itself"
	labelledByOrigin  = "an entry made by hand is labelled by its origin (Journal entry)"
	notSent           = "Books sends only what a customer or a vendor receives: the sales documents and the purchase order"
	noHeaderSource    = "no report source reads its header: reports read its posted entry (books.journal_lines, the receivable and payable items)"
)

type kindRegistry struct {
	name     string
	has      func(d registryDocument) bool
	excluded map[string]string
}

// ownCollections are the kind's own collection and each of its line collections.
func ownCollections(d registryDocument) []string {
	out := []string{d.Collection}
	for _, line := range d.Lines {
		out = append(out, line.Collection)
	}
	return out
}

// auditedOwnCollections are ownCollections without the tax lines: the server
// computes a tax line from its document's lines, so the audit rows of those lines
// and of the document already record each change.
func auditedOwnCollections(d registryDocument) []string {
	return slices.DeleteFunc(ownCollections(d), isTaxLines)
}

func isTaxLines(collection string) bool {
	return strings.HasSuffix(collection, "_tax_lines")
}

func allIn(set map[string]bool, items []string) bool {
	for _, item := range items {
		if !set[item] {
			return false
		}
	}
	return true
}

func setOf(items []string) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, item := range items {
		out[item] = true
	}
	return out
}

func documentKindRegistries(t *testing.T, docs []registryDocument) []kindRegistry {
	t.Helper()
	audited := setOf(slices.Collect(maps.Keys(auditedCollections(nil))))
	recordTypes := map[string]bool{}
	for _, option := range auditRecordTypeOptions() {
		recordTypes[option.Value] = true
	}
	oauthCollections := setOf(slices.Collect(maps.Keys(oauthPackage().Collections)))
	indexed := map[string]bool{}
	for _, index := range searchIndexes {
		indexed[index.Collection] = true
	}
	sourced := map[string]bool{}
	for _, source := range reportSources() {
		sourced[source.Collection] = true
		for _, part := range source.Parts {
			sourced[part.Collection] = true
		}
	}
	entryDocTypes := map[string]bool{}
	for _, option := range entryDocTypeOptions() {
		entryDocTypes[option.Value] = true
	}
	var cliEntryTypes map[string]bool
	for _, d := range docs {
		if d.Name != "journal-entries" {
			continue
		}
		for _, field := range d.Fields {
			if field.Name == "doc_type" {
				cliEntryTypes = setOf(field.Enum)
			}
		}
	}
	if cliEntryTypes == nil {
		t.Fatal("cli/documents.json: journal-entries has no doc_type enum")
	}
	neverPostKinds := map[string]string{"estimate": neverPosts, "purchase_order": neverPosts}
	sendExcluded := map[string]string{}
	for _, key := range []string{
		"journal", "transfer", "bill", "expense", "vendor_credit", "payment", "bill_payment",
		"vendor_refund", "write_off", "deposit", "inventory_adjustment",
	} {
		sendExcluded[key] = notSent
	}
	sourceExcluded := map[string]string{}
	for _, key := range []string{
		"estimate", "bill", "expense", "vendor_credit", "payment", "bill_payment",
		"vendor_refund", "write_off", "deposit", "inventory_adjustment",
	} {
		sourceExcluded[key] = noHeaderSource
	}

	return []kindRegistry{
		{
			name:     "auditedCollections (audit.go), the kind and its lines",
			has:      func(d registryDocument) bool { return allIn(audited, auditedOwnCollections(d)) },
			excluded: map[string]string{},
		},
		{
			name:     "auditRecordTypeOptions (audit.go), the kind and its lines",
			has:      func(d registryDocument) bool { return allIn(recordTypes, auditedOwnCollections(d)) },
			excluded: map[string]string{},
		},
		{
			name: "auditParentFields (audit.go): each line names its document by the CLI's parent field",
			has: func(d registryDocument) bool {
				for _, line := range d.Lines {
					if isTaxLines(line.Collection) {
						continue
					}
					if auditParentFields[line.Collection] != line.Parent {
						return false
					}
				}
				return true
			},
			excluded: map[string]string{},
		},
		{
			name:     "oauthPackage (oauth_scopes.go), the kind and its lines",
			has:      func(d registryDocument) bool { return allIn(oauthCollections, ownCollections(d)) },
			excluded: map[string]string{},
		},
		{
			name:     "searchIndexes (search_index.go)",
			has:      func(d registryDocument) bool { return indexed[d.Collection] },
			excluded: map[string]string{},
		},
		{
			name:     "reportSources (report_sources.go), a source or a source part",
			has:      func(d registryDocument) bool { return sourced[d.Collection] },
			excluded: sourceExcluded,
		},
		{
			name: "entry_routes.json: the document an entry opens",
			has:  func(d registryDocument) bool { return entryRoutes[d.key()] == d.Name },
			excluded: map[string]string{
				"journal":        entryIsDocument,
				"transfer":       entryIsDocument,
				"estimate":       neverPosts,
				"purchase_order": neverPosts,
			},
		},
		{
			name: "entry_type_labels.json docTypes",
			has: func(d registryDocument) bool {
				_, ok := entryTypeLabels.DocTypes[d.key()]
				return ok
			},
			excluded: map[string]string{
				"journal":        labelledByOrigin,
				"estimate":       neverPosts,
				"purchase_order": neverPosts,
			},
		},
		{
			name:     "entryDocTypeOptions (report_sources.go)",
			has:      func(d registryDocument) bool { return entryDocTypes[d.key()] },
			excluded: neverPostKinds,
		},
		{
			name:     "CLI journal-entries doc_type enum (cli/documents.json)",
			has:      func(d registryDocument) bool { return cliEntryTypes[d.key()] },
			excluded: neverPostKinds,
		},
		{
			name:     "sendDocTypes (document_sends.go)",
			has:      func(d registryDocument) bool { return sendDocTypes[d.key()] },
			excluded: sendExcluded,
		},
	}
}

func TestDocumentKindRegistries(t *testing.T) {
	docs := loadRegistryDocuments(t)
	keys := make([]string, 0, len(docs))
	for _, d := range docs {
		keys = append(keys, d.key())
	}
	for _, registry := range documentKindRegistries(t, docs) {
		t.Run(registry.name, func(t *testing.T) {
			for key, reason := range registry.excluded {
				if !slices.Contains(keys, key) {
					t.Errorf("excludes %q, which is no kind of cli/documents.json", key)
				}
				if reason == "" {
					t.Errorf("excludes %q with no reason", key)
				}
			}
			for _, d := range docs {
				reason, isExcluded := registry.excluded[d.key()]
				listed := registry.has(d)
				if !isExcluded && !listed {
					t.Errorf("%s (%s) is missing: add it, or exclude it here with the reason", d.key(), d.Name)
				}
				if isExcluded && listed {
					t.Errorf("%s (%s) is listed but excluded (%s): remove the exclusion", d.key(), d.Name, reason)
				}
			}
		})
	}
}
