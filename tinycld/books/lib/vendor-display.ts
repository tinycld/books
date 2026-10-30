import type { PartyListCopy } from './party-list'

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
