/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// The document's gross and currency on each tax line, stored at posting beside
// the taxable amount (server/sales_document_posting.go writeTaxSnapshot), so
// the Sales Tax Liability report reads the figures fixed at posting: a later
// change to a rate, a product or a customer never changes them. gross_amount is
// the document's subtotal before tax, in integer cents. No backfill: Books is
// not live. The list rules are unchanged: clients only read tax lines.
const COLLECTIONS = ['books_invoice_tax_lines', 'books_sales_receipt_tax_lines']
const MAX_AMOUNT = 9007199254740991
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'

migrate(
    app => {
        for (const name of COLLECTIONS) {
            const lines = app.findCollectionByNameOrId(name)
            lines.fields.add(
                new NumberField({
                    name: 'gross_amount',
                    onlyInt: true,
                    min: -MAX_AMOUNT,
                    max: MAX_AMOUNT,
                })
            )
            lines.fields.add(new TextField({ name: 'currency', pattern: OPTIONAL_CURRENCY }))
            app.save(lines)
        }
    },
    app => {
        for (const name of COLLECTIONS) {
            const lines = app.findCollectionByNameOrId(name)
            for (const field of ['gross_amount', 'currency']) {
                lines.fields.removeByName(field)
            }
            app.save(lines)
        }
    }
)
