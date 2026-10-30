import type { WithVirtualProps } from '@tanstack/db'

// A live query publishes every row with TanStack DB's virtual props, so a fixture row
// that stands in for a query row carries them too.
export function publishedRow<T extends { id: string }>(
    row: T,
    collectionId: string
): WithVirtualProps<T, string> {
    return {
        ...row,
        $hasPendingWrites: false,
        $synced: true,
        $origin: 'remote',
        $key: row.id,
        $collectionId: collectionId,
    }
}
