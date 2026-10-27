import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import {
    BillingAddressField,
    EmailField,
    ParentCustomerField,
    PhoneField,
    ShippingAddressField,
    WebsiteField,
} from './customer-fields'

// The UI half of the Books forms hosts (hosts.ts is the data half the generator
// reads in Node). Component names match the hosts' `component`s.
const ui: FormHostUi = {
    components: {
        EmailField,
        PhoneField,
        WebsiteField,
        ParentCustomerField,
        BillingAddressField,
        ShippingAddressField,
    },
}

export default ui
