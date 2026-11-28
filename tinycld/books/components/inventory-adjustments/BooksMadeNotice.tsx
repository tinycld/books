import { Text, View } from 'react-native'
import type { AdjustmentRecordHeader } from '../../hooks/useAdjustmentRecord'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { DELETED_ITEM_TEXT } from '../../lib/adjustment-list'
import { booksMadeNotice } from '../../lib/adjustment-read'
import { PRODUCTS_PATH } from '../../lib/product-route'
import { stockSourceRouteBase, stockSourceWord } from '../../lib/stock-move-link'
import { TextLink } from '../payments/read-view-parts'

// The notice of an inventory adjustment Books made (inventory-adjust spec §3.5): an opening
// adjustment names its item (`openingItemName`, read with the header by
// useAdjustmentRecord), a re-cost the number of its source document (read by
// useRecostSourceNumber in useAdjustmentScreen). A failed read of either is the screen's
// load error, so the notice only draws what it is given.

type NoticeAdjustment = Pick<
    AdjustmentRecordHeader,
    'kind' | 'status' | 'source' | 'document' | 'openingItemName'
>

const NOTICE_BOX = 'gap-1 rounded-xl border border-border bg-surface-secondary p-3'
const PRODUCT_LINK = { routeBase: PRODUCTS_PATH }

function NoticeLink({
    isVisible,
    text,
    onOpen,
}: {
    isVisible: boolean
    text: string
    onOpen(): void
}) {
    if (!isVisible) return null
    return <TextLink text={text} onPress={onOpen} testID="adjustment-books-made-link" />
}

function NoticeBody({
    text,
    linkText,
    hasLink,
    onOpen,
}: {
    text: string
    linkText: string
    hasLink: boolean
    onOpen(): void
}) {
    return (
        <View testID="adjustment-books-made" className={NOTICE_BOX}>
            <Text className="text-sm text-foreground">{text}</Text>
            <NoticeLink isVisible={hasLink} text={linkText} onOpen={onOpen} />
        </View>
    )
}

// The item is the product the opening adjustment's `document` names; "Deleted item" when
// that row is gone.
function OpeningNotice({ adjustment }: { adjustment: NoticeAdjustment }) {
    const open = useOpenDocument(PRODUCT_LINK, adjustment.document)
    const itemName = adjustment.openingItemName ?? DELETED_ITEM_TEXT
    const notice = booksMadeNotice(adjustment, { itemName, documentNumber: '' })
    if (!notice) return null
    return (
        <NoticeBody
            text={notice.text}
            linkText="Open the item"
            hasLink={notice.target !== null}
            onOpen={open}
        />
    )
}

// The re-cost's notice with its document's number ('' when it is not known): the link opens
// the document by the pop-or-push rule of useOpenDocument.
function RecostNotice({
    adjustment,
    documentNumber,
}: {
    adjustment: NoticeAdjustment
    documentNumber: string
}) {
    const routeBase = stockSourceRouteBase(adjustment.source) ?? ''
    const open = useOpenDocument({ routeBase }, adjustment.document)
    const notice = booksMadeNotice(adjustment, { itemName: '', documentNumber })
    if (!notice) return null
    const documentText = [stockSourceWord(adjustment.source), documentNumber]
        .filter(Boolean)
        .join(' ')
    return (
        <NoticeBody
            text={notice.text}
            linkText={`Open ${documentText}`}
            hasLink={notice.target !== null}
            onOpen={open}
        />
    )
}

/**
 * The notice of an adjustment Books made; nothing for a manual one. `sourceNumber` is the
 * number of a re-cost's source document (undefined when it is gone).
 */
export function BooksMadeNotice({
    adjustment,
    sourceNumber,
}: {
    adjustment: NoticeAdjustment
    sourceNumber: string | undefined
}) {
    if (adjustment.kind === 'opening') return <OpeningNotice adjustment={adjustment} />
    if (adjustment.kind === 'recost') {
        return <RecostNotice adjustment={adjustment} documentNumber={sourceNumber ?? ''} />
    }
    return null
}
