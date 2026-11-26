import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { RecordByIdScreen } from '../../components/RecordByIdScreen'
import { VendorPage } from '../../components/vendors/page/VendorPage'
import { useCodeRouteId } from '../../hooks/useRouteRecordId'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { useDeletingRecord } from '../../stores/record-form-store'
import { useVendorFormStore } from '../../stores/vendor-form-store'
import type { BooksVendors } from '../../types'

/**
 * One vendor's page — `/a/books/vendors/<code>`, an id opens it too — over the list, or
 * beside a column of its names on a very wide window.
 */
export default function VendorRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useCodeRouteId('books_vendors', key)
    if (id === undefined) return null
    return <VendorScreen key={id} id={id} />
}

function VendorScreen({ id }: { id: string }) {
    const [vendorsCollection] = useStore('books_vendors')
    const { record, isLoading } = useRecord(vendorsCollection, id)
    const deletingRecord = useDeletingRecord(useVendorFormStore, id)
    const { leave } = useVendorNavigation()
    const renderVendor = (shown: BooksVendors) => <VendorPage record={shown} />
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
