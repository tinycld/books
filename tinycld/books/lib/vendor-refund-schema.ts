// The vendor refund's one zod schema, for Save draft and Post alike (vendor refund spec
// §3.5). The spec names one argument (the currency); the account rule needs the Refunded
// to values the form lists and the row-date rule each listed credit's date, so the plan
// adds them as the second and third.

import type { z } from '@tinycld/core/ui/form'
import { paymentSchemaWith } from './payment-schema'
import type { PaymentFormValues } from './payment-values'
import { VENDOR_REFUND_FLOW } from './vendor-refund-flow'

export function vendorRefundSchema(
    currency: string,
    accountOptions: readonly string[],
    creditDates: Readonly<Record<string, string>>
): z.ZodType<PaymentFormValues, PaymentFormValues> {
    return paymentSchemaWith({
        currency,
        accountOptions,
        texts: VENDOR_REFUND_FLOW.texts,
        sumRule: VENDOR_REFUND_FLOW.sumRule,
        rowDates: creditDates,
    })
}
