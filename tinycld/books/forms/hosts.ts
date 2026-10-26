import type { FormHostDefInput } from '@tinycld/core/lib/forms/host'

export const CUSTOMER_HOST_KEY = 'books:customer'

// The default Customer form: one page, with first and last name, email and phone, and
// mobile and website side by side wherever the form is 640 px wide or more.
const LAYOUT = {
    pages: [{ key: 'main', title: 'Customer' }],
    fields: {
        first_name: { width: 'half' },
        last_name: { width: 'half' },
        email: { width: 'half' },
        phone: { width: 'half' },
        mobile: { width: 'half' },
        website: { width: 'half' },
    },
} satisfies FormHostDefInput['layout']

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
        // Every column, `id` and the server-only `name_key` too: a custom key must
        // never shadow a column.
        columns: [
            'id',
            'display_name',
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
            'inactive',
            'form',
            'fields',
            'name_key',
            'created',
            'updated',
        ],
        builtin: [
            {
                key: 'display_name',
                label: 'Display name',
                kind: 'text',
                storage: 'column',
                required: true,
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
            { key: 'notes', label: 'Notes', kind: 'textarea', storage: 'column', required: false },
        ],
        insertCustomBefore: 'notes',
        layout: LAYOUT,
    },
]

export default hosts
