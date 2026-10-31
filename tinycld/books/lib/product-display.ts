import type { DeleteDialogLine } from '../components/DeleteRecordDialog'
import type { PartyListCopy } from './party-list'
import { BUNDLE_DELETE_NOTE, UNSAVED_PRODUCT_DELETE_WARNING } from './product-messages'
import { type ProductType, productTypeNoun } from './product-types'
import { recordTitle } from './record-display'

// The open product's title follows the noun of the form's current type.
export function productTitle(
    type: ProductType,
    { mode, canWrite }: { mode: 'new' | 'edit'; canWrite: boolean }
): string {
    return recordTitle(productTypeNoun(type), { mode, canWrite })
}

export function productsEmptyHint(canWrite: boolean): string {
    if (canWrite) return 'Add what you sell and what you buy.'
    return 'Products and services appear here once a bookkeeper adds them.'
}

export function productListCopy(canWrite: boolean): PartyListCopy {
    return {
        title: 'Products and services',
        singular: 'product or service',
        plural: 'products or services',
        searchPlaceholder: 'Search products and services',
        emptyHint: productsEmptyHint(canWrite),
    }
}

// The Delete product or service dialog's lines, in order.
export function productDeleteLines({
    name,
    isBundle,
    isOpenAndDirty,
    refusal,
}: {
    name: string
    isBundle: boolean
    isOpenAndDirty: boolean
    refusal: string | null
}): DeleteDialogLine[] {
    const lines: DeleteDialogLine[] = [
        { key: 'name', text: name, tone: 'plain' },
        { key: 'explanation', text: 'This cannot be undone.', tone: 'muted' },
    ]
    if (isBundle) lines.push({ key: 'bundle', text: BUNDLE_DELETE_NOTE, tone: 'muted' })
    if (isOpenAndDirty) {
        lines.push({ key: 'unsaved', text: UNSAVED_PRODUCT_DELETE_WARNING, tone: 'plain' })
    }
    if (refusal) lines.push({ key: 'refusal', text: refusal, tone: 'error' })
    return lines
}
