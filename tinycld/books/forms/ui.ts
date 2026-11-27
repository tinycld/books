import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import { MONEY_VALUE_SCHEMA } from '../lib/money-input'
import { QUANTITY_VALUE_SCHEMA } from '../lib/quantity-input'
import { recordCodeSchema } from '../lib/record-code'
import { SHIP_TO_SCHEMA } from '../lib/ship-to'
import { ExpenseAccountField, IncomeAccountField } from './account-fields'
import { EmailField, PhoneField, PlainAddressField, WebsiteField } from './contact-fields'
import { ParentCustomerField, ShippingAddressField } from './customer-fields'
import {
    BandEmailField,
    BillToField,
    CustomerField,
    DocumentDateField,
    DocumentTaxField,
    DocumentTermsField,
    DueDateField,
    MailingAddressField,
    VendorField,
    VendorRefField,
} from './document-fields'
import {
    LineAmountCell,
    LineDescriptionCell,
    LinePercentCell,
    LineProductCell,
    LineQuantityCell,
    LineRateCell,
    LineTaxableCell,
} from './document-line-cells'
import {
    AcceptedByField,
    AcceptedDateField,
    EstimateStatusField,
    ExpirationDateField,
} from './estimate-fields'
import {
    AssetAccountField,
    CogsAccountField,
    OpeningDateField,
    PreferredVendorField,
    QuantityField,
    QuantityOnHandField,
} from './inventory-fields'
import { MoneyField } from './money-fields'
import {
    DepositAccountField,
    PaymentAccountField,
    PaymentMethodField,
    RefundFromField,
    RequiredPaymentMethodField,
} from './payment-fields'
import { BundleProductCell, ProductTypeField } from './product-fields'
import {
    LineAccountCell,
    LineItemAmountCell,
    LinePurchaseDescriptionCell,
    LinePurchaseProductCell,
    LineTypedAmountCell,
} from './purchase-line-cells'
import { ShipToField } from './purchase-order-fields'
import {
    CustomerCodeField,
    CustomerNameField,
    ProductCodeField,
    ProductNameField,
    VendorCodeField,
    VendorNameField,
} from './record-code-fields'
import { ExemptionReasonField, TaxRateField } from './tax-fields'
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
        ExemptionReasonField,
        TaxRateField,
        CustomerField,
        BillToField,
        BandEmailField,
        DocumentTermsField,
        DocumentDateField,
        DueDateField,
        DocumentTaxField,
        LineProductCell,
        LineDescriptionCell,
        LineQuantityCell,
        LineRateCell,
        LinePercentCell,
        LineAmountCell,
        LineTaxableCell,
        PaymentMethodField,
        RequiredPaymentMethodField,
        DepositAccountField,
        RefundFromField,
        PaymentAccountField,
        EstimateStatusField,
        ExpirationDateField,
        AcceptedByField,
        AcceptedDateField,
        VendorField,
        MailingAddressField,
        VendorRefField,
        LineAccountCell,
        LinePurchaseProductCell,
        LinePurchaseDescriptionCell,
        LineTypedAmountCell,
        LineItemAmountCell,
        AssetAccountField,
        CogsAccountField,
        PreferredVendorField,
        QuantityField,
        QuantityOnHandField,
        OpeningDateField,
        CustomerNameField,
        CustomerCodeField,
        VendorNameField,
        VendorCodeField,
        ProductNameField,
        ProductCodeField,
        ShipToField,
    },
    // The money and quantity inputs' rules run through the forms engine, at save and
    // between saves, so a refused value blocks the save and its message is the cell's
    // inline text.
    schemas: {
        MoneyField: MONEY_VALUE_SCHEMA,
        QuantityField: QUANTITY_VALUE_SCHEMA,
        CustomerCodeField: recordCodeSchema,
        VendorCodeField: recordCodeSchema,
        ProductCodeField: recordCodeSchema,
        ShipToField: SHIP_TO_SCHEMA,
    },
}

export default ui
