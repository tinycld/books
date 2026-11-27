import type { FormHostDefInput } from '@tinycld/core/lib/forms/host'
import { BUNDLE_ITEM_COLUMNS } from '../lib/bundle-items'
import { DOCUMENT_LINE_COLUMNS, DOCUMENT_ROW_KINDS } from '../lib/document-line-columns'
import { DOCUMENT_NOTE_LABELS, MEMO_ONLY_LABEL, VENDOR_MESSAGE_LABEL } from '../lib/document-notes'
import { EXPENSE_REF_HINT, VENDOR_CREDIT_REF_HINT, VENDOR_REF_HINT } from '../lib/document-texts'
import {
    ACCOUNT_ROW_KIND,
    PURCHASE_ACCOUNT_COLUMNS,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_ITEM_ROW_KIND,
} from '../lib/purchase-line-columns'
import {
    INVOICE_KIND,
    MEMO_HINT,
    PURCHASE_ORDER_HOST_KEY,
    SALES_RECEIPT_KIND,
} from '../lib/sales-document-kinds'

export const CUSTOMER_HOST_KEY = 'books:customer'

// The default Customer form: one page, with first and last name, email and phone,
// mobile and website, and the exemption reason and certificate number side by side
// wherever the form is 640 px wide or more. The rules that show the exemption fields
// only for an exempt customer, and the default sales tax only for one that is not, are
// part of the layout, so they are seeded into the stored form, where an admin can
// change them in Settings → Forms.
const LAYOUT = {
    pages: [{ key: 'main', title: 'Customer' }],
    fields: {
        code: { width: 'quarter' },
        first_name: { width: 'half' },
        last_name: { width: 'half' },
        email: { width: 'half' },
        phone: { width: 'half' },
        mobile: { width: 'half' },
        website: { width: 'half' },
        exemption_reason: { width: 'half' },
        exemption_number: { width: 'half' },
        terms: { width: 'quarter' },
    },
    rules: [
        {
            key: 'hide_exemption',
            when: [{ field: 'tax_exempt', op: 'is_false' }],
            actions: [
                { action: 'hide', field: 'exemption_reason' },
                { action: 'hide', field: 'exemption_number' },
            ],
        },
        {
            key: 'hide_default_tax',
            when: [{ field: 'tax_exempt', op: 'is_true' }],
            actions: [{ action: 'hide', field: 'default_tax_rate' }],
        },
    ],
} satisfies FormHostDefInput['layout']

export const VENDOR_HOST_KEY = 'books:vendor'

// The default Vendor form: one page, with first and last name, email and phone, mobile
// and website, payment terms and account number, and the 1099 tax ID type and tax ID
// side by side wherever the form is 640 px wide or more. The rule that hides the 1099
// details while tracking is off is part of the layout, so it is seeded into the stored
// form, where an admin can move, relabel or change it in Settings → Forms.
const VENDOR_LAYOUT = {
    pages: [{ key: 'main', title: 'Vendor' }],
    fields: {
        code: { width: 'quarter' },
        first_name: { width: 'half' },
        last_name: { width: 'half' },
        email: { width: 'half' },
        phone: { width: 'half' },
        mobile: { width: 'half' },
        website: { width: 'half' },
        terms: { width: 'half' },
        account_number: { width: 'half' },
        tax_id_type: { width: 'half' },
        tax_id: { width: 'half' },
    },
    rules: [
        {
            key: 'hide_1099_details',
            when: [{ field: 'track_1099', op: 'is_false' }],
            actions: [
                { action: 'hide', field: 'legal_name' },
                { action: 'hide', field: 'tax_id_type' },
                { action: 'hide', field: 'tax_id' },
            ],
        },
    ],
} satisfies FormHostDefInput['layout']

export const PRODUCT_HOST_KEY = 'books:product'

// The default Product or service form: one page, with Name and vendor part number, Sales price and
// Income account, and Cost and Expense account side by side wherever the form is 640 px
// wide or more. The purchase fields hide while "I purchase this from a vendor" is off;
// that is a rule of the form, so admins see it and may change it in Settings → Forms.
// Taxable's description is the toggle's help text in the seeded form. The fields of an
// Inventory item follow: its two accounts' neighbours in one row, the opening stock in
// the next. Quantity on hand has a row of its own, because a new item does not show it
// and a missing half would pull the next field into its row.
const PRODUCT_LAYOUT = {
    pages: [{ key: 'main', title: 'Product or service' }],
    fields: {
        name: { width: 'half' },
        code: { width: 'quarter' },
        vendor_part_no: { width: 'half' },
        price: { width: 'half' },
        income_account: { width: 'half' },
        taxable: { description: 'Charge sales tax on this item when it is sold.' },
        cost: { width: 'half' },
        expense_account: { width: 'half' },
        asset_account: { width: 'half' },
        preferred_vendor: { width: 'half' },
        opening_quantity: { width: 'third' },
        opening_value: { width: 'third' },
        opening_date: {
            width: 'third',
            description: 'The date the opening quantity and value are counted on.',
        },
        reorder_point: {
            width: 'half',
            description: 'The quantity on hand at which you buy more.',
        },
    },
    rules: [
        {
            key: 'purchase_fields',
            when: [{ field: 'purchases', op: 'is_false' }],
            actions: [
                { action: 'hide', field: 'purchase_description' },
                { action: 'hide', field: 'cost' },
                { action: 'hide', field: 'expense_account' },
            ],
        },
    ],
} satisfies FormHostDefInput['layout']

export const INVOICE_HOST_KEY = 'books:invoice'

// The default Invoice form: one page. Customer, Bill to and Email span the header
// band; Terms, Invoice date, Due date and Tax share a row. Tax takes its content's
// width, never a share of the row. Below 640 px core draws each date as a half, so
// Terms and Invoice date fill one row and Tax sits beside Due date on the next, or on
// its own row when the form is too narrow for both. The lines, the message to the
// customer and the internal memo follow, each with a hint that says who reads it.
const INVOICE_LAYOUT = {
    pages: [{ key: 'main', title: 'Invoice' }],
    fields: {
        customer: { width: 'full' },
        bill_to: { width: 'full' },
        email: { width: 'full' },
        terms: { width: 'quarter' },
        date: { width: 'quarter' },
        due_date: { width: 'quarter' },
        tax_rate: { width: 'quarter', narrowWidth: 'full' },
        message: { description: INVOICE_KIND.noteHints.message },
        memo: { description: INVOICE_KIND.noteHints.memo },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const SALES_RECEIPT_HOST_KEY = 'books:sales_receipt'

// The default Sales receipt form (spec §4.4): one page. The header band's first row
// holds Customer, Bill to, Email, Sale date and Tax as the invoice's does; its second
// row holds the payment: Payment method, Reference no. and Deposit to, a third each.
// The lines, the message to the customer and the internal memo follow.
const SALES_RECEIPT_LAYOUT = {
    pages: [{ key: 'main', title: 'Sales receipt' }],
    fields: {
        customer: { width: 'full' },
        bill_to: { width: 'full' },
        email: { width: 'full' },
        date: { width: 'quarter' },
        tax_rate: { width: 'quarter', narrowWidth: 'full' },
        payment_method: { width: 'third' },
        reference_no: { width: 'third', description: 'Check or card reference' },
        deposit_to: { width: 'third' },
        message: { description: SALES_RECEIPT_KIND.noteHints.message },
        memo: { description: SALES_RECEIPT_KIND.noteHints.memo },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const CREDIT_MEMO_HOST_KEY = 'books:credit_memo'

// The default Credit memo form (spec §4.4): one page. Customer, Bill to and Email span
// the header band; Credit memo date and Tax share the next row, a half each, and Tax
// takes the full row on a narrow form. A credit memo has no Terms and no Due date. The
// lines, the message to the customer and the internal memo follow.
export const CREDIT_MEMO_LAYOUT = {
    pages: [{ key: 'main', title: 'Credit memo' }],
    fields: {
        customer: { width: 'full' },
        bill_to: { width: 'full' },
        email: { width: 'full' },
        date: { width: 'half' },
        tax_rate: { width: 'half', narrowWidth: 'full' },
        message: { description: 'Shown on the credit memo and its PDF.' },
        memo: { description: MEMO_HINT },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const REFUND_RECEIPT_HOST_KEY = 'books:refund_receipt'

// The default Refund receipt form (refund receipt spec §4.4): one page. The header
// band's first row holds Customer, Bill to, Email, Refund date and Tax with the sales
// receipt's widths; its second row holds the payment: Payment method, Reference no.
// and Refund from, a third each. The lines, the message to the customer and the
// internal memo follow.
export const REFUND_RECEIPT_LAYOUT = {
    pages: [{ key: 'main', title: 'Refund receipt' }],
    fields: {
        customer: { width: 'full' },
        bill_to: { width: 'full' },
        email: { width: 'full' },
        date: { width: 'quarter' },
        tax_rate: { width: 'quarter', narrowWidth: 'full' },
        payment_method: { width: 'third' },
        reference_no: { width: 'third', description: 'Check or card reference' },
        refund_from: { width: 'third' },
        message: { description: 'Shown on the refund receipt and its PDF.' },
        memo: { description: MEMO_HINT },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const ESTIMATE_HOST_KEY = 'books:estimate'

// The default Estimate form (spec §3.3): one page. The header band's first row holds
// Customer, Bill to, Email, Estimate date, Expiration date and Tax as the invoice's
// does; its second row holds Status, Accepted by and Accepted date, a third each. The
// lines, the message to the customer and the internal memo follow.
const ESTIMATE_LAYOUT = {
    pages: [{ key: 'main', title: 'Estimate' }],
    fields: {
        customer: { width: 'full' },
        bill_to: { width: 'full' },
        email: { width: 'full' },
        date: { width: 'quarter' },
        expiration_date: { width: 'quarter' },
        tax_rate: { width: 'quarter', narrowWidth: 'full' },
        status: { width: 'third' },
        accepted_by: { width: 'third' },
        accepted_date: { width: 'third' },
        message: { description: 'Shown on the estimate and its PDF.' },
        memo: { description: 'Only your team sees this.' },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const BILL_HOST_KEY = 'books:bill'

// The default Bill form (spec §3.3): one page. Vendor and Mailing address share the
// first row of the header band; Terms, Bill date, Due date and Vendor's bill no. share
// the second, a quarter each (core draws a quarter as a half below 640 px). Custom
// fields follow Vendor's bill no.; the account lines, the product lines and the
// internal memo follow. A bill has no message.
const BILL_LAYOUT = {
    pages: [{ key: 'main', title: 'Bill' }],
    fields: {
        vendor: { width: 'half' },
        mailing_address: { width: 'half' },
        terms: { width: 'quarter' },
        date: { width: 'quarter' },
        due_date: { width: 'quarter' },
        ref_no: { width: 'quarter', description: VENDOR_REF_HINT },
        memo: { description: MEMO_HINT },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

// The default Purchase order form (purchase order spec §3.3): one page. The header band's
// first row holds Vendor, Mailing address and Email, a third each, the full row below
// 640 px; its second holds Order date (a quarter) and Ship to (a half). Custom fields
// follow Ship to; the account lines, the product lines, the message to the vendor and
// the internal memo follow.
const PURCHASE_ORDER_LAYOUT = {
    pages: [{ key: 'main', title: 'Purchase order' }],
    fields: {
        vendor: { width: 'third', narrowWidth: 'full' },
        mailing_address: { width: 'third', narrowWidth: 'full' },
        email: { width: 'third', narrowWidth: 'full' },
        date: { width: 'quarter' },
        ship_to: { width: 'half' },
        message: { description: 'Shown on the purchase order and its PDF.' },
        memo: { description: 'Only your team sees this.' },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

export const EXPENSE_HOST_KEY = 'books:expense'

export const VENDOR_CREDIT_HOST_KEY = 'books:vendor_credit'

// The default Vendor credit form (vendor credit spec §3.3): one page. Vendor, Credit date
// and Vendor's credit no. share the header band's one row, a third each, the full row
// below 640 px. Custom fields follow Vendor's credit no.; the account lines, the product
// lines and the internal memo follow. A vendor credit has no mailing address, terms, due
// date or message.
export const VENDOR_CREDIT_LAYOUT = {
    pages: [{ key: 'main', title: 'Vendor credit' }],
    fields: {
        vendor: { width: 'third', narrowWidth: 'full' },
        date: { width: 'third', narrowWidth: 'full' },
        ref_no: { width: 'third', narrowWidth: 'full', description: VENDOR_CREDIT_REF_HINT },
        memo: { description: MEMO_HINT },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

// A custom File field on a bill, expense or vendor credit form stores its files in
// books_attachments (spec §3.8), keyed by the document; the Attachments section's rows
// share the collection with an empty `field`. No column is added to the host collection.
function attachmentFiles(recordColumn: 'bill' | 'expense' | 'vendor_credit') {
    return {
        collection: 'books_attachments',
        recordColumn,
        fieldColumn: 'field',
        sizeColumn: 'size',
        uploaderColumn: 'uploaded_by',
        nameColumn: 'name',
        fileColumn: 'file',
    }
}

// The default Expense form (spec §3.3): one page. The header band's first row holds
// Vendor, Paid from and Payment date; its second holds Payment method and Ref no.; a
// third each, the full row below 640 px. Custom fields follow Ref no.; the account
// lines, the product lines and the internal memo follow. An expense has no address,
// terms, due date or message.
export const EXPENSE_LAYOUT = {
    pages: [{ key: 'main', title: 'Expense' }],
    fields: {
        vendor: { width: 'third', narrowWidth: 'full' },
        paid_from: { width: 'third', narrowWidth: 'full' },
        date: { width: 'third', narrowWidth: 'full' },
        payment_method: { width: 'third', narrowWidth: 'full' },
        reference_no: { width: 'third', narrowWidth: 'full', description: EXPENSE_REF_HINT },
        memo: { description: MEMO_HINT },
    },
    rules: [],
} satisfies FormHostDefInput['layout']

// The lines built-in the sales documents share: the same columns, row kinds and keys,
// so the server's line guard checks an invoice, receipt, credit memo or estimate line
// alike.
const DOCUMENT_LINES_BUILTIN = {
    key: 'lines',
    label: 'Lines',
    kind: 'table',
    storage: 'rows',
    required: true,
    columns: [...DOCUMENT_LINE_COLUMNS],
    rowKinds: [...DOCUMENT_ROW_KINDS],
    rowShortcuts: true,
    // The Item kind's Alt+Enter adds a line after the focused one, so the
    // row menu's "Insert line below" names that key.
    insertShortcuts: { below: 'Alt+Enter' },
} satisfies FormHostDefInput['builtin'][number]

// The two line tables the purchase documents (a bill, an expense, a vendor credit) share:
// the same columns, row kinds and keys, so the server's line guard checks a bill, expense
// or vendor credit line alike. Not required, unlike the sales `lines`: the Purchase lines setting hides one
// table, and a required built-in cannot be hidden. The kind's schema holds the post's
// line-count rule. The server's line guard finds a line's row kind in either table.
const PURCHASE_LINE_BUILTINS = [
    {
        key: 'account_lines',
        label: 'Account details',
        kind: 'table',
        storage: 'rows',
        required: false,
        columns: [...PURCHASE_ACCOUNT_COLUMNS],
        rowKinds: [ACCOUNT_ROW_KIND],
        rowShortcuts: true,
        // The account kind's Alt+Enter adds a line after the focused one, so the row
        // menu's "Insert line below" names that key.
        insertShortcuts: { below: ACCOUNT_ROW_KIND.shortcut },
    },
    {
        key: 'item_lines',
        label: 'Product and service details',
        kind: 'table',
        storage: 'rows',
        required: false,
        columns: [...PURCHASE_ITEM_COLUMNS],
        rowKinds: [PURCHASE_ITEM_ROW_KIND],
        rowShortcuts: true,
        insertShortcuts: { below: PURCHASE_ITEM_ROW_KIND.shortcut },
    },
] satisfies FormHostDefInput['builtin']

// Pure data: the generator imports this in Node (server/form_hosts.json). Keys of
// column built-ins ARE the column names; their order is the default form's field
// order. Later Books units append their hosts here.
const hosts: FormHostDefInput[] = [
    {
        key: CUSTOMER_HOST_KEY,
        label: 'Customer',
        collection: 'books_customers',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, `id` and the server-only `name_key` and `sort_key` too: a custom key must
        // never shadow a column.
        columns: [
            'id',
            'display_name',
            'code',
            'company',
            'first_name',
            'last_name',
            'email',
            'phone',
            'mobile',
            'website',
            'parent',
            'billing_address',
            'shipping_address',
            'notes',
            'tax_exempt',
            'exemption_reason',
            'exemption_number',
            'default_tax_rate',
            'inactive',
            'terms',
            'form',
            'fields',
            'name_key',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            // The name's change handler suggests the code (forms/record-code-fields.tsx).
            {
                key: 'display_name',
                label: 'Display name',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'CustomerNameField',
                chrome: 'cell',
            },
            // Empty is allowed: the server then makes the code from the name
            // (server/record_codes.go).
            {
                key: 'code',
                label: 'Code',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'CustomerCodeField',
                chrome: 'cell',
            },
            {
                key: 'company',
                label: 'Company name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'first_name',
                label: 'First name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'last_name',
                label: 'Last name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'EmailField',
                chrome: 'cell',
            },
            {
                key: 'phone',
                label: 'Phone',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PhoneField',
                chrome: 'cell',
            },
            {
                key: 'mobile',
                label: 'Mobile',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PhoneField',
                chrome: 'cell',
            },
            {
                key: 'website',
                label: 'Website',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'WebsiteField',
                chrome: 'cell',
            },
            {
                key: 'parent',
                label: 'Parent customer',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ParentCustomerField',
                chrome: 'cell',
            },
            {
                key: 'billing_address',
                label: 'Billing address',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillingAddressField',
                chrome: 'cell',
            },
            {
                key: 'shipping_address',
                label: 'Shipping address',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ShippingAddressField',
                chrome: 'cell',
            },
            {
                key: 'tax_exempt',
                label: 'This customer is tax exempt',
                kind: 'toggle',
                storage: 'column',
                required: false,
            },
            {
                key: 'exemption_reason',
                label: 'Exemption reason',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ExemptionReasonField',
                chrome: 'cell',
            },
            // The client checks the length as it checks a custom text field; the
            // migration's `max: 100` is the server's backstop.
            {
                key: 'exemption_number',
                label: 'Exemption certificate number',
                kind: 'text',
                storage: 'column',
                required: false,
                maxLength: 100,
            },
            {
                key: 'default_tax_rate',
                label: 'Default sales tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'TaxRateField',
                chrome: 'cell',
            },
            // An invoice fills its own Terms from this one.
            {
                key: 'terms',
                label: 'Payment terms',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PaymentTermsField',
                chrome: 'cell',
            },
            { key: 'notes', label: 'Notes', kind: 'textarea', storage: 'column', required: false },
        ],
        insertCustomBefore: 'notes',
        layout: LAYOUT,
    },
    {
        key: VENDOR_HOST_KEY,
        label: 'Vendor',
        collection: 'books_vendors',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, `id` and the server-only `name_key` and `sort_key` too: a custom key must
        // never shadow a column.
        columns: [
            'id',
            'display_name',
            'code',
            'company',
            'first_name',
            'last_name',
            'email',
            'phone',
            'mobile',
            'website',
            'address',
            'terms',
            'account_number',
            'expense_account',
            'notes',
            'track_1099',
            'legal_name',
            'tax_id_type',
            'tax_id',
            'inactive',
            'form',
            'fields',
            'name_key',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            // The name's change handler suggests the code (forms/record-code-fields.tsx).
            {
                key: 'display_name',
                label: 'Display name',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'VendorNameField',
                chrome: 'cell',
            },
            // Empty is allowed: the server then makes the code from the name
            // (server/record_codes.go).
            {
                key: 'code',
                label: 'Code',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'VendorCodeField',
                chrome: 'cell',
            },
            {
                key: 'company',
                label: 'Company name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'first_name',
                label: 'First name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'last_name',
                label: 'Last name',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'EmailField',
                chrome: 'cell',
            },
            {
                key: 'phone',
                label: 'Phone',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PhoneField',
                chrome: 'cell',
            },
            {
                key: 'mobile',
                label: 'Mobile',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PhoneField',
                chrome: 'cell',
            },
            {
                key: 'website',
                label: 'Website',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'WebsiteField',
                chrome: 'cell',
            },
            {
                key: 'address',
                label: 'Address',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'VendorAddressField',
                chrome: 'cell',
            },
            {
                key: 'terms',
                label: 'Payment terms',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PaymentTermsField',
                chrome: 'cell',
            },
            {
                key: 'account_number',
                label: 'Account number',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'AccountNumberField',
                chrome: 'cell',
            },
            {
                key: 'expense_account',
                label: 'Default expense account',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ExpenseAccountField',
                chrome: 'cell',
            },
            {
                key: 'track_1099',
                label: 'Track payments for 1099',
                kind: 'toggle',
                storage: 'column',
                required: false,
            },
            {
                key: 'legal_name',
                label: 'Legal name',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'LegalNameField',
                chrome: 'cell',
            },
            {
                key: 'tax_id_type',
                label: 'Tax ID type',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'TaxIdTypeField',
                chrome: 'cell',
            },
            {
                key: 'tax_id',
                label: 'Tax ID',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'TaxIdField',
                chrome: 'cell',
            },
            { key: 'notes', label: 'Notes', kind: 'textarea', storage: 'column', required: false },
        ],
        insertCustomBefore: 'notes',
        layout: VENDOR_LAYOUT,
    },
    {
        key: PRODUCT_HOST_KEY,
        label: 'Product or service',
        collection: 'books_products',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, `id` and the server-only `name_key`, `sort_key` and `currency` too: a custom key
        // must never shadow a column.
        columns: [
            'id',
            'type',
            'name',
            'code',
            'vendor_part_no',
            'sales_description',
            'price',
            'income_account',
            'purchases',
            'purchase_description',
            'cost',
            'expense_account',
            'asset_account',
            'preferred_vendor',
            'reorder_point',
            'opening_quantity',
            'opening_value',
            'opening_date',
            'quantity_on_hand',
            'stock_value',
            'quantity_on_po',
            'taxable',
            'inactive',
            'currency',
            'form',
            'fields',
            'name_key',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'type',
                label: 'Type',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'ProductTypeField',
                chrome: 'cell',
            },
            // The name's change handler suggests the code (forms/record-code-fields.tsx).
            {
                key: 'name',
                label: 'Name',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'ProductNameField',
                chrome: 'cell',
            },
            // Empty is allowed: the server then makes the code from the name
            // (server/record_codes.go).
            {
                key: 'code',
                label: 'Code',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ProductCodeField',
                chrome: 'cell',
            },
            {
                key: 'vendor_part_no',
                label: 'Vendor part no.',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            {
                key: 'sales_description',
                label: 'Sales description',
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'items',
                label: 'Bundle items',
                kind: 'table',
                storage: 'rows',
                required: false,
                columns: [...BUNDLE_ITEM_COLUMNS],
            },
            {
                key: 'quantity_on_hand',
                label: 'Quantity on hand',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'QuantityOnHandField',
                chrome: 'cell',
            },
            {
                key: 'price',
                label: 'Sales price',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'MoneyField',
                chrome: 'cell',
            },
            {
                key: 'income_account',
                label: 'Income account',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'IncomeAccountField',
                chrome: 'cell',
            },
            {
                key: 'taxable',
                label: 'Taxable',
                kind: 'toggle',
                storage: 'column',
                required: false,
            },
            {
                key: 'purchases',
                label: 'I purchase this from a vendor',
                kind: 'toggle',
                storage: 'column',
                required: false,
            },
            {
                key: 'purchase_description',
                label: 'Purchase description',
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'cost',
                label: 'Cost',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'MoneyField',
                chrome: 'cell',
            },
            {
                key: 'expense_account',
                label: 'Expense account',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ExpenseAccountField',
                chrome: 'cell',
            },
            {
                key: 'asset_account',
                label: 'Inventory asset account',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'AssetAccountField',
                chrome: 'cell',
            },
            {
                key: 'preferred_vendor',
                label: 'Preferred vendor',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PreferredVendorField',
                chrome: 'cell',
            },
            {
                key: 'opening_quantity',
                label: 'Opening quantity',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'QuantityField',
                chrome: 'cell',
            },
            {
                key: 'opening_value',
                label: 'Opening value',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'MoneyField',
                chrome: 'cell',
            },
            {
                key: 'opening_date',
                label: 'Opening stock as of',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'OpeningDateField',
                chrome: 'cell',
            },
            {
                key: 'reorder_point',
                label: 'Reorder point',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'QuantityField',
                chrome: 'cell',
            },
        ],
        layout: PRODUCT_LAYOUT,
    },
    {
        key: INVOICE_HOST_KEY,
        label: 'Invoice',
        collection: 'books_invoices',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'customer',
            'status',
            'number',
            'sequence',
            'date',
            'due_date',
            'terms',
            'bill_to',
            'email',
            'tax_rate',
            'message',
            'memo',
            'subtotal',
            'tax_total',
            'total',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'estimate',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'customer',
                label: 'Customer',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'CustomerField',
                chrome: 'cell',
            },
            {
                key: 'bill_to',
                label: 'Bill to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillToField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BandEmailField',
                chrome: 'cell',
            },
            {
                key: 'terms',
                label: 'Terms',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTermsField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Invoice date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'due_date',
                label: 'Due date',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'DueDateField',
                chrome: 'cell',
            },
            {
                key: 'tax_rate',
                label: 'Tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTaxField',
                chrome: 'cell',
            },
            DOCUMENT_LINES_BUILTIN,
            // Core allows maxLength only on a text built-in; documentSchema bounds these
            // two at 4000 code points, as the migration does.
            {
                key: 'message',
                label: DOCUMENT_NOTE_LABELS.message,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'lines',
        layout: INVOICE_LAYOUT,
    },
    {
        key: SALES_RECEIPT_HOST_KEY,
        label: 'Sales receipt',
        collection: 'books_sales_receipts',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'customer',
            'status',
            'number',
            'sequence',
            'date',
            'bill_to',
            'email',
            'tax_rate',
            'payment_method',
            'reference_no',
            'deposit_to',
            'message',
            'memo',
            'subtotal',
            'tax_total',
            'total',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            // Optional: a walk-in sale names no customer.
            {
                key: 'customer',
                label: 'Customer',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'CustomerField',
                chrome: 'cell',
            },
            {
                key: 'bill_to',
                label: 'Bill to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillToField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BandEmailField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Sale date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'tax_rate',
                label: 'Tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTaxField',
                chrome: 'cell',
            },
            {
                key: 'payment_method',
                label: 'Payment method',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PaymentMethodField',
                chrome: 'cell',
            },
            {
                key: 'reference_no',
                label: 'Reference no.',
                kind: 'text',
                storage: 'column',
                required: false,
                maxLength: 40,
            },
            // Not host-required: the form hides it when "Sales deposited to" names an
            // account, and a hidden built-in cannot be required. The form's schema
            // requires it while it is shown, and the server always does.
            {
                key: 'deposit_to',
                label: 'Deposit to',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DepositAccountField',
                chrome: 'cell',
            },
            DOCUMENT_LINES_BUILTIN,
            {
                key: 'message',
                label: DOCUMENT_NOTE_LABELS.message,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'lines',
        layout: SALES_RECEIPT_LAYOUT,
    },
    {
        key: CREDIT_MEMO_HOST_KEY,
        label: 'Credit memo',
        collection: 'books_credit_memos',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, the server-written ones too: a custom key must never shadow a
        // column. invoice is a stored column, not a built-in: the form's link row
        // writes it.
        columns: [
            'id',
            'customer',
            'status',
            'number',
            'sequence',
            'date',
            'bill_to',
            'email',
            'tax_rate',
            'invoice',
            'message',
            'memo',
            'subtotal',
            'tax_total',
            'total',
            'balance',
            'applied',
            'revision',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'customer',
                label: 'Customer',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'CustomerField',
                chrome: 'cell',
            },
            {
                key: 'bill_to',
                label: 'Bill to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillToField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BandEmailField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Credit memo date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'tax_rate',
                label: 'Tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTaxField',
                chrome: 'cell',
            },
            DOCUMENT_LINES_BUILTIN,
            // Core allows maxLength only on a text built-in; documentSchema bounds these
            // two at 4000 code points, as the migration does.
            {
                key: 'message',
                label: DOCUMENT_NOTE_LABELS.message,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'lines',
        layout: CREDIT_MEMO_LAYOUT,
    },
    {
        key: REFUND_RECEIPT_HOST_KEY,
        label: 'Refund receipt',
        collection: 'books_refund_receipts',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, the server-written ones too: a custom key must never shadow a
        // column. sales_receipt and credit_memo are stored columns, not built-ins: the
        // form's link row writes them.
        columns: [
            'id',
            'customer',
            'status',
            'number',
            'sequence',
            'date',
            'bill_to',
            'email',
            'tax_rate',
            'payment_method',
            'reference_no',
            'refund_from',
            'sales_receipt',
            'credit_memo',
            'message',
            'memo',
            'subtotal',
            'tax_total',
            'total',
            'revision',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            // Optional: a walk-in refund names no customer.
            {
                key: 'customer',
                label: 'Customer',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'CustomerField',
                chrome: 'cell',
            },
            {
                key: 'bill_to',
                label: 'Bill to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillToField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BandEmailField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Refund date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'tax_rate',
                label: 'Tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTaxField',
                chrome: 'cell',
            },
            {
                key: 'payment_method',
                label: 'Payment method',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'PaymentMethodField',
                chrome: 'cell',
            },
            {
                key: 'reference_no',
                label: 'Reference no.',
                kind: 'text',
                storage: 'column',
                required: false,
                maxLength: 40,
            },
            // Required, unlike the sales receipt's Deposit to: no setting hides Refund
            // from, and the server always requires it (checkRefundFromAccount).
            {
                key: 'refund_from',
                label: 'Refund from',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'RefundFromField',
                chrome: 'cell',
            },
            DOCUMENT_LINES_BUILTIN,
            // Core allows maxLength only on a text built-in; documentSchema bounds these
            // two at 4000 code points, as the migration does.
            {
                key: 'message',
                label: DOCUMENT_NOTE_LABELS.message,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'lines',
        layout: REFUND_RECEIPT_LAYOUT,
    },
    {
        key: ESTIMATE_HOST_KEY,
        label: 'Estimate',
        collection: 'books_estimates',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'customer',
            'status',
            'number',
            'sequence',
            'date',
            'expiration_date',
            'accepted_by',
            'accepted_date',
            'bill_to',
            'email',
            'tax_rate',
            'message',
            'memo',
            'subtotal',
            'tax_total',
            'total',
            'currency',
            'invoice',
            'form',
            'fields',
            'public_token',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'customer',
                label: 'Customer',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'CustomerField',
                chrome: 'cell',
            },
            {
                key: 'bill_to',
                label: 'Bill to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BillToField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'BandEmailField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Estimate date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'expiration_date',
                label: 'Expiration date',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ExpirationDateField',
                chrome: 'cell',
            },
            {
                key: 'tax_rate',
                label: 'Tax',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTaxField',
                chrome: 'cell',
            },
            {
                key: 'status',
                label: 'Status',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'EstimateStatusField',
                chrome: 'cell',
            },
            // Accepted by and Accepted date show only while Status is Accepted (the
            // form hides them by the status value), and a hidden built-in cannot be
            // host-required: the form's schema requires Accepted date while it is
            // shown, and the server requires it on an accepted estimate.
            {
                key: 'accepted_by',
                label: 'Accepted by',
                kind: 'text',
                storage: 'column',
                required: false,
                maxLength: 200,
                // A text built-in still: the component only wraps the input in the
                // band's `estimate-accepted-by` box.
                component: 'AcceptedByField',
                chrome: 'cell',
            },
            {
                key: 'accepted_date',
                label: 'Accepted date',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'AcceptedDateField',
                chrome: 'cell',
            },
            DOCUMENT_LINES_BUILTIN,
            {
                key: 'message',
                label: DOCUMENT_NOTE_LABELS.message,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'lines',
        layout: ESTIMATE_LAYOUT,
    },
    {
        key: BILL_HOST_KEY,
        label: 'Bill',
        collection: 'books_bills',
        formColumn: 'form',
        fieldsColumn: 'fields',
        files: attachmentFiles('bill'),
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'vendor',
            'status',
            'number',
            'sequence',
            'date',
            'due_date',
            'terms',
            'mailing_address',
            'ref_no',
            'memo',
            'subtotal',
            'total',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'vendor',
                label: 'Vendor',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'VendorField',
                chrome: 'cell',
            },
            {
                key: 'mailing_address',
                label: 'Mailing address',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'MailingAddressField',
                chrome: 'cell',
            },
            {
                key: 'terms',
                label: 'Terms',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'DocumentTermsField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Bill date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'due_date',
                label: 'Due date',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'DueDateField',
                chrome: 'cell',
            },
            {
                key: 'ref_no',
                label: "Vendor's bill no.",
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'VendorRefField',
                // The cell draws the label and the error; VendorRefField draws the input
                // (core's error border) and the hint while there is no error, and the
                // document form drops this field's description (spec §3.6 refusals). Not
                // bare: core draws a bare cell only on a stored record, never on a new one.
                chrome: 'cell',
            },
            ...PURCHASE_LINE_BUILTINS,
            {
                key: 'memo',
                label: MEMO_ONLY_LABEL,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'account_lines',
        layout: BILL_LAYOUT,
    },
    {
        key: PURCHASE_ORDER_HOST_KEY,
        label: 'Purchase order',
        collection: 'books_purchase_orders',
        formColumn: 'form',
        fieldsColumn: 'fields',
        // No files: a purchase order has no attachments (spec §3.1).
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'vendor',
            'status',
            'number',
            'sequence',
            'date',
            'mailing_address',
            'email',
            'ship_to',
            'message',
            'memo',
            'subtotal',
            'total',
            'open_amount',
            'currency',
            'closed_reason',
            'closed_by',
            'closed_at',
            'created_by',
            'revision',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'vendor',
                label: 'Vendor',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'VendorField',
                chrome: 'cell',
            },
            {
                key: 'mailing_address',
                label: 'Mailing address',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'MailingAddressField',
                chrome: 'cell',
            },
            {
                key: 'email',
                label: 'Email',
                kind: 'custom',
                storage: 'column',
                required: false,
                // Always an input and a Tab stop (spec §3.3): the vendor pick fills it and
                // moves the focus to it.
                component: 'EmailField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Order date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'ship_to',
                label: 'Ship to',
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'ShipToField',
                chrome: 'cell',
            },
            ...PURCHASE_LINE_BUILTINS,
            {
                key: 'message',
                label: VENDOR_MESSAGE_LABEL,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
            {
                key: 'memo',
                label: DOCUMENT_NOTE_LABELS.memo,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'account_lines',
        layout: PURCHASE_ORDER_LAYOUT,
    },
    {
        key: EXPENSE_HOST_KEY,
        label: 'Expense',
        collection: 'books_expenses',
        formColumn: 'form',
        fieldsColumn: 'fields',
        files: attachmentFiles('expense'),
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'vendor',
            'paid_from',
            'payment_method',
            'reference_no',
            'status',
            'number',
            'sequence',
            'date',
            'memo',
            'subtotal',
            'total',
            'currency',
            'revision',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            // Optional: an expense may be paid to no vendor ("No vendor").
            {
                key: 'vendor',
                label: 'Vendor',
                kind: 'custom',
                storage: 'column',
                required: false,
                locked: true,
                component: 'VendorField',
                chrome: 'cell',
            },
            {
                key: 'paid_from',
                label: 'Paid from',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'PaymentAccountField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Payment date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            {
                key: 'payment_method',
                label: 'Payment method',
                kind: 'custom',
                storage: 'column',
                required: true,
                component: 'RequiredPaymentMethodField',
                chrome: 'cell',
            },
            // No maxLength: core would add its own "Ref no. is too long" beside the record
            // schema's 40-character text (EXPENSE_MESSAGES.referenceTooLong), as the bill's
            // ref_no. The migration holds the same 40 bound.
            {
                key: 'reference_no',
                label: 'Ref no.',
                kind: 'text',
                storage: 'column',
                required: false,
            },
            ...PURCHASE_LINE_BUILTINS,
            {
                key: 'memo',
                label: MEMO_ONLY_LABEL,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'account_lines',
        layout: EXPENSE_LAYOUT,
    },
    {
        key: VENDOR_CREDIT_HOST_KEY,
        label: 'Vendor credit',
        collection: 'books_vendor_credits',
        formColumn: 'form',
        fieldsColumn: 'fields',
        files: attachmentFiles('vendor_credit'),
        // Every column, the server-written ones too: a custom key must never shadow a
        // column.
        columns: [
            'id',
            'vendor',
            'status',
            'number',
            'sequence',
            'date',
            'ref_no',
            'memo',
            'subtotal',
            'total',
            'balance',
            'revision',
            'currency',
            'entry',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'replaces',
            'replaced_by',
            'form',
            'fields',
            'sort_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'vendor',
                label: 'Vendor',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'VendorField',
                chrome: 'cell',
            },
            {
                key: 'date',
                label: 'Credit date',
                kind: 'custom',
                storage: 'column',
                required: true,
                locked: true,
                component: 'DocumentDateField',
                chrome: 'cell',
            },
            // As the bill's ref_no: VendorRefField draws the input and the layout's
            // description as its hint; the cell draws the label and the error.
            {
                key: 'ref_no',
                label: "Vendor's credit no.",
                kind: 'custom',
                storage: 'column',
                required: false,
                component: 'VendorRefField',
                chrome: 'cell',
            },
            ...PURCHASE_LINE_BUILTINS,
            {
                key: 'memo',
                label: MEMO_ONLY_LABEL,
                kind: 'textarea',
                storage: 'column',
                required: false,
            },
        ],
        insertCustomBefore: 'account_lines',
        layout: VENDOR_CREDIT_LAYOUT,
    },
]

export default hosts
