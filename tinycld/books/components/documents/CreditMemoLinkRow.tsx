import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useFormContext, useFormState } from 'react-hook-form'
import { Text, View } from 'react-native'
import { INVOICE_LINK_KEY } from '../../lib/credit-memo-link'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import { DocumentSourceLink } from './DocumentSourceLink'
import { useDocumentFormScope } from './document-form-context'

const ROW_STYLE = { gap: 12, minHeight: 44 }
// The band's row gap is each field cell's bottom margin (core FieldCell `mb-3`): the cell
// above already leaves it over the row, and the row leaves the same under it, over the
// date row (DocumentForm's unruled BandSecondRow adds none).
const BAND_ROW_GAP = { marginBottom: 12 }

// The refusal the server gave the link ("Choose a posted invoice of this customer."),
// under the row; null when there is none.
function LinkError({ message }: { message: string | undefined }) {
    if (!message) return null
    return (
        <Text testID="credit-memo-invoice-error" className="mt-1 text-xs text-destructive">
            {message}
        </Text>
    )
}

/**
 * The credit memo form's invoice link row (the kind's FormBandRow): "For invoice 1004",
 * or "(void)" once that invoice is void, which opens the invoice, then Remove link. The
 * link is no field of the form: the scope holds it, and the save writes it. Nothing shows
 * while the form names no invoice. Remove link changes only the form; the next save
 * writes it, so it works while writes are unavailable, as every field does.
 */
export function CreditMemoLinkRow() {
    const { invoiceLink } = useDocumentFormScope()
    const { control, clearErrors } = useFormContext()
    const { errors } = useFormState({ control, name: INVOICE_LINK_KEY })
    if (invoiceLink.id === '') return null
    const errorMessage = errors[INVOICE_LINK_KEY]?.message
    const message = typeof errorMessage === 'string' ? errorMessage : undefined
    const onRemove = () => {
        clearErrors(INVOICE_LINK_KEY)
        invoiceLink.remove()
    }
    return (
        <View testID="credit-memo-link-row" style={BAND_ROW_GAP}>
            <View className="flex-row flex-wrap items-center" style={ROW_STYLE}>
                <DocumentSourceLink
                    label={invoiceLink.label}
                    kind={INVOICE_KIND}
                    id={invoiceLink.id}
                    testID="credit-memo-invoice-link"
                />
                <Button
                    testID="credit-memo-remove-link"
                    variant="outline"
                    size="sm"
                    onPress={onRemove}
                >
                    <ButtonText>Remove link</ButtonText>
                </Button>
            </View>
            <LinkError message={message} />
        </View>
    )
}
