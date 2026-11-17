/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books vendor credits: a credit a vendor gives the business (a return, an
// overcharge, a credit note), its lines, and the applications that use it to
// lower bills. A vendor credit is the mirror of a bill (2100000013), as the
// credit memo is the mirror of an invoice: posting debits Accounts payable and
// credits the lines' accounts (server/vendor_credits.go,
// server/sales_document_posting.go).
//
// AUTHORIZATION. The rules are the bill's: every member with read access lists
// and views vendor credits and their lines, a writer creates and edits drafts,
// moves a posted credit to void, and deletes drafts. The Go hooks in
// server/sales_documents.go and server/vendor_credits.go decide whether the
// write is valid: the vendor exists and is active when the write sets or
// changes it, the credit date is a real day, the vendor's credit no. is not on
// another non-void credit of the same vendor, a credit holds at most 250 lines,
// each line has its kind's cells, and the total is from 0 to 2^53-1 cents.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the bill, and balance among them: the credit not yet applied, the total at
// posting less its applications, 0 on a draft or a void credit. Only Books
// writes it (server/document_balance.go). REVISION is as on the bill.
//
// A vendor credit has no terms, no due date and no mailing address. ref_no is
// the number on the vendor's credit note. form and fields are the core forms
// engine's host columns (books:vendor_credit).
//
// APPLICATIONS. A row applies part of a posted credit to a posted bill of the
// same vendor on an apply date. A writer creates and deletes rows; a row never
// changes (remove it and apply again). The server writes applied_by and moves
// both balances (server/vendor_credit_applications.go). Neither relation
// cascades: a posted credit or bill is never deleted.
//
// ATTACHMENTS AND CASH BASIS. books_attachments and books_cash_basis_lines gain
// a vendor_credit relation here, where books_vendor_credits exists, as
// 2100000022 adds credit_memo for the credit memo.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1. DATES are YYYY-MM-DD
// text, as on journal entries.
//
// The rule constants repeat 2100000013's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991
// The largest line amount, as on journal lines.
const MAX_AMOUNT = 1000000000000000

const VENDOR_CREDIT_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'total',
    'balance',
    'currency',
    'entry',
    'replaced_by',
    'posted_by',
    'posted_at',
    'voided_by',
    'voided_at',
    'sort_key',
]

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]
const userRef = name => ({
    name,
    type: 'relation',
    collectionId: '_pb_users_auth_',
    cascadeDelete: false,
    maxSelect: 1,
})
const relation = (name, collectionId, extra = {}) => ({
    name,
    type: 'relation',
    collectionId,
    cascadeDelete: false,
    maxSelect: 1,
    ...extra,
})

const CASH_LINE_KINDS_BEFORE = ['bill', 'invoice', 'credit_memo']

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const products = app.findCollectionByNameOrId('books_products')
        const bills = app.findCollectionByNameOrId('books_bills')

        app.save(
            new Collection({
                id: 'pbc_books_vcredits',
                name: 'books_vendor_credits',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...VENDOR_CREDIT_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...VENDOR_CREDIT_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    relation('vendor', vendors.id, { required: true }),
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['draft', 'posted', 'void'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'ref_no', type: 'text', max: 40 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // The credit not yet applied: a posted credit's total less its
                    // applications (0 on a draft or a void credit). Only
                    // server/document_balance.go writes it.
                    { name: 'balance', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // Counts the transactions that changed the draft or its lines. A
                    // save or a post states the value it saw (server/revision.go).
                    { name: 'revision', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    relation('entry', entries.id),
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    relation('form', forms.id),
                    { name: 'fields', type: 'json', maxSize: 1000000 },
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relations need the collection to exist first.
        const credits = app.findCollectionByNameOrId('books_vendor_credits')
        for (const name of ['replaces', 'replaced_by']) {
            credits.fields.add(
                new RelationField({ name, collectionId: credits.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        credits.indexes = [
            'CREATE INDEX idx_books_vendor_credits_vendor ON books_vendor_credits (vendor, ref_no)',
            'CREATE INDEX idx_books_vendor_credits_status_date ON books_vendor_credits (status, date)',
            'CREATE INDEX idx_books_vendor_credits_form ON books_vendor_credits (form)',
            // A vendor's unapplied credits (the apply dialog, the Pay Bills notice).
            'CREATE INDEX idx_books_vendor_credits_vendor_open ON books_vendor_credits (vendor, status, balance)',
        ]
        app.save(credits)

        app.save(
            new Collection({
                id: 'pbc_books_vcredit_lines',
                name: 'books_vendor_credit_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: `${WRITE} && ${unset('vendor_credit')} && vendor_credit.status = "draft"`,
                deleteRule: `${WRITE} && vendor_credit.status = "draft"`,
                fields: [
                    relation('vendor_credit', credits.id, { required: true, cascadeDelete: true }),
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['account', 'item'],
                    },
                    relation('account', accounts.id),
                    relation('product', products.id),
                    { name: 'description', type: 'text', max: 4000 },
                    { name: 'quantity', type: 'number', min: 0.01, max: 1000000 },
                    { name: 'rate', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_vendor_credit_lines_credit ON books_vendor_credit_lines (vendor_credit, position)',
                    'CREATE INDEX idx_books_vendor_credit_lines_account ON books_vendor_credit_lines (account)',
                    'CREATE INDEX idx_books_vendor_credit_lines_product ON books_vendor_credit_lines (product)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_vcredit_apps',
                name: 'books_vendor_credit_applications',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('applied_by')}`,
                updateRule: null,
                deleteRule: WRITE,
                fields: [
                    relation('vendor_credit', credits.id, { required: true }),
                    relation('bill', bills.id, { required: true }),
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    userRef('applied_by'),
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                ],
                indexes: [
                    'CREATE INDEX idx_books_vendor_credit_applications_credit ON books_vendor_credit_applications (vendor_credit)',
                    'CREATE INDEX idx_books_vendor_credit_applications_bill ON books_vendor_credit_applications (bill)',
                ],
            })
        )

        const attachments = app.findCollectionByNameOrId('books_attachments')
        attachments.fields.add(
            new RelationField({
                name: 'vendor_credit',
                required: false,
                collectionId: credits.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        attachments.indexes = [
            ...attachments.indexes,
            'CREATE INDEX idx_books_attachments_vendor_credit ON books_attachments (vendor_credit, created)',
        ]
        app.save(attachments)

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.fields.getByName('document_kind').values = [...CASH_LINE_KINDS_BEFORE, 'vendor_credit']
        cashLines.fields.add(
            new RelationField({
                name: 'vendor_credit',
                collectionId: credits.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        cashLines.indexes = [
            ...cashLines.indexes,
            'CREATE INDEX idx_books_cash_basis_lines_vendor_credit ON books_cash_basis_lines (vendor_credit)',
        ]
        app.save(cashLines)

        // Books search over vendor credits, drafts included, as fts_books_bills
        // (2100000013): the number, the vendor's credit no. and the memo. It
        // holds no vendor name, so a renamed vendor needs no reindex. On a new
        // database there are no vendor credits to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_vendor_credits USING fts5(record_id UNINDEXED, number, ref_no, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_vendor_credits').execute()

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.indexes = cashLines.indexes.filter(index => !index.includes('_vendor_credit '))
        cashLines.fields.removeByName('vendor_credit')
        cashLines.fields.getByName('document_kind').values = CASH_LINE_KINDS_BEFORE
        app.save(cashLines)

        const attachments = app.findCollectionByNameOrId('books_attachments')
        attachments.indexes = attachments.indexes.filter(index => !index.includes('_vendor_credit '))
        attachments.fields.removeByName('vendor_credit')
        app.save(attachments)

        for (const name of [
            'books_vendor_credit_applications',
            'books_vendor_credit_lines',
            'books_vendor_credits',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
