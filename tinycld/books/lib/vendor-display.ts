import type { DeleteDialogLine } from '../components/DeleteRecordDialog'
import type { PartyListCopy } from './party-list'
import { UNSAVED_VENDOR_DELETE_WARNING } from './vendor-messages'

export function vendorsEmptyHint(canWrite: boolean): string {
    if (canWrite) return 'Add the people and companies you buy from.'
    return 'Vendors appear here once a bookkeeper adds them.'
}

export function vendorListCopy(canWrite: boolean): PartyListCopy {
    return {
        title: 'Vendors',
        singular: 'vendor',
        plural: 'vendors',
        searchPlaceholder: 'Search vendors',
        emptyHint: vendorsEmptyHint(canWrite),
    }
}

// The Delete vendor dialog's lines, in order.
export function vendorDeleteLines({
    name,
    isOpenAndDirty,
    refusal,
}: {
    name: string
    isOpenAndDirty: boolean
    refusal: string | null
}): DeleteDialogLine[] {
    const lines: DeleteDialogLine[] = [
        { key: 'name', text: name, tone: 'plain' },
        { key: 'explanation', text: 'This cannot be undone.', tone: 'muted' },
    ]
    if (isOpenAndDirty) {
        lines.push({ key: 'unsaved', text: UNSAVED_VENDOR_DELETE_WARNING, tone: 'plain' })
    }
    if (refusal) lines.push({ key: 'refusal', text: refusal, tone: 'error' })
    return lines
}
