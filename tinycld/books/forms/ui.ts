import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import { MONEY_VALUE_SCHEMA } from '../lib/money-input'
import { ExpenseAccountField, IncomeAccountField } from './account-fields'
import { EmailField, PhoneField, PlainAddressField, WebsiteField } from './contact-fields'
import { ParentCustomerField, ShippingAddressField } from './customer-fields'
import { MoneyField } from './money-fields'
import { BundleProductCell, ProductTypeField } from './product-fields'
import { LegalNameField, TaxIdField, TaxIdTypeField } from './vendor-1099-fields'
import { AccountNumberField, PaymentTermsField } from './vendor-fields'

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
        ProductTypeField,
        MoneyField,
        IncomeAccountField,
        BundleProductCell,
        LegalNameField,
        TaxIdTypeField,
        TaxIdField,
    },
    // The money input's rules run through the forms engine, at save and between saves,
    // so a refused amount blocks the save and its message is the cell's inline text.
    schemas: { MoneyField: MONEY_VALUE_SCHEMA },
}

export default ui
