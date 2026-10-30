import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { RecordByIdScreen } from '../../components/RecordByIdScreen'
import { VendorChild } from '../../components/vendors/VendorChild'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { useDeletingRecord } from '../../stores/record-form-store'
import { useVendorFormStore } from '../../stores/vendor-form-store'
import type { BooksVendors } from '../../types'

/** One vendor — `/a/books/vendors/<id>` — to edit or view, over the list or beside it. */
export default function VendorScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [vendorsCollection] = useStore('books_vendors')
    const { record, isLoading } = useRecord(vendorsCollection, id)
    const deletingRecord = useDeletingRecord(useVendorFormStore, id)
    const { leave } = useVendorNavigation()
    const renderVendor = (shown: BooksVendors) => (
        <VendorChild target={{ mode: 'edit', record: shown }} />
    )
    return (
        <RecordByIdScreen
            record={record ?? deletingRecord}
            isLoading={isLoading}
            testIdPrefix="vendor"
            backLabel="Vendors"
            title="Vendor"
            notFoundMessage="This vendor doesn't exist or was removed"
            notFoundBackLabel="Back to vendors"
            onLeave={leave}
            renderRecord={renderVendor}
        />
    )
}
