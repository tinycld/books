import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import { EmailField, PhoneField, PlainAddressField, WebsiteField } from './contact-fields'
import { ParentCustomerField, ShippingAddressField } from './customer-fields'
import { LegalNameField, TaxIdField, TaxIdTypeField } from './vendor-1099-fields'
import { AccountNumberField, ExpenseAccountField, PaymentTermsField } from './vendor-fields'

// The UI half of the Books forms hosts (hosts.ts is the data half the generator
// reads in Node). Component names match the hosts' `component`s.
const ui: FormHostUi = {
    components: {
        EmailField,
        PhoneField,
        WebsiteField,
        ParentCustomerField,
        BillingAddressField: PlainAddressField,
        ShippingAddressField,
        VendorAddressField: PlainAddressField,
        PaymentTermsField,
        AccountNumberField,
        ExpenseAccountField,
        LegalNameField,
        TaxIdTypeField,
        TaxIdField,
    },
}

export default ui
