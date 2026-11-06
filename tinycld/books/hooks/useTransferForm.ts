import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { type TransferFormValues, transferAmountText, transferSchema } from '../lib/transfer'

export function useTransferForm({
    initial,
    currency,
}: {
    initial: TransferFormValues
    currency: string
}) {
    const form = useForm<TransferFormValues>({
        defaultValues: initial,
        resolver: zodResolver(transferSchema(currency)),
    })
    const watched = useWatch({ control: form.control })
    const values: TransferFormValues = { ...initial, ...watched }
    return {
        form,
        initial,
        values,
        amountText: transferAmountText(values.amount, currency),
        isDirty: form.formState.isDirty,
    }
}
