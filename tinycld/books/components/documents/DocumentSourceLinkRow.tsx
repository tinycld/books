import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { useFormContext, useFormState } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { DocumentSourceLink } from './DocumentSourceLink'
import { useDocumentFormScope } from './document-form-context'

const ROW_STYLE = { gap: 12, minHeight: 44 }
// The band's row gap is each field cell's bottom margin (core FieldCell `mb-3`): the cell
// above already leaves it over the row, and the row leaves the same under it, over the
// date row (DocumentForm's unruled rows add none).
const BAND_ROW_GAP = { marginBottom: 12 }

// The test ids of a kind's link row: the row, the link, Remove link and the error line.
export type SourceLinkRowIds = { row: string; link: string; remove: string; error: string }

// The refusal of the link (the server's "Choose a posted invoice of this customer.", or a
// payout's cap), under the row; null when there is none.
function LinkError({ message, testID }: { message: string | undefined; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} className="mt-1 text-xs text-destructive">
            {message}
        </Text>
    )
}

// The plain text right after the link (a payout's " · $250.00 unapplied"): no link and no
// Tab stop; it wraps under the link on a narrow width. Null when the link has none.
function LinkDetail({ text }: { text: string | undefined }) {
    if (!text) return null
    return <Text className="text-sm text-muted-foreground">{text}</Text>
}

function RemoveLinkButton({
    isVisible,
    testID,
    onPress,
}: {
    isVisible: boolean
    testID: string
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" size="sm" onPress={onPress}>
            <ButtonText>Remove link</ButtonText>
        </Button>
    )
}

interface DocumentSourceLinkRowProps {
    ids: SourceLinkRowIds
    // The kind of the document the link opens.
    targetKind: Pick<SalesDocumentKind, 'routeBase'>
    // The form error key the link's refusal is filed at (the link's column).
    errorKey: string
    // Drawn under the link and its button (a payout's notice).
    children?: ReactNode
}

/**
 * A form's source link row (a kind's FormBandRow): the scope's link label, which opens
 * the source, and its plain detail text after it (a payout's unapplied credit), then
 * Remove link while the link allows it (DocumentFormScope.sourceLink
 * `canRemove`), `children` under them, and the refusal filed at `errorKey` under that.
 * The link is no field of the form: the scope holds it, and the save writes it. Nothing
 * shows while the form names no source. Remove link changes only the form; the next save
 * writes it, so it works while writes are unavailable, as every field does.
 */
export function DocumentSourceLinkRow({
    ids,
    targetKind,
    errorKey,
    children,
}: DocumentSourceLinkRowProps) {
    const { sourceLink } = useDocumentFormScope()
    const { control, clearErrors } = useFormContext()
    const { errors } = useFormState({ control, name: errorKey })
    if (sourceLink.id === '') return null
    const errorMessage = errors[errorKey]?.message
    const message = typeof errorMessage === 'string' ? errorMessage : undefined
    const onRemove = () => {
        clearErrors(errorKey)
        sourceLink.remove()
    }
    return (
        <View testID={ids.row} style={BAND_ROW_GAP}>
            <View className="flex-row flex-wrap items-center" style={ROW_STYLE}>
                <View className="shrink flex-row flex-wrap items-center">
                    <DocumentSourceLink
                        label={sourceLink.label}
                        kind={targetKind}
                        id={sourceLink.id}
                        testID={ids.link}
                    />
                    <LinkDetail text={sourceLink.detail} />
                </View>
                <RemoveLinkButton
                    isVisible={sourceLink.canRemove}
                    testID={ids.remove}
                    onPress={onRemove}
                />
            </View>
            {children}
            <LinkError message={message} testID={ids.error} />
        </View>
    )
}
