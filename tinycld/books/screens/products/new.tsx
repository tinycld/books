import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { ListBanner } from '../../components/ListBanner'
import { ProductChild } from '../../components/products/ProductChild'
import { ProductTypeChooser } from '../../components/products/ProductTypeChooser'
import { RecordLoadingBody, RecordSurface } from '../../components/RecordSurface'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useFormAccounts } from '../../hooks/useFormAccounts'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { newProductValues } from '../../lib/product-defaults'
import { PRODUCT_ACCESS_LOAD_ERROR, PRODUCT_ACCOUNTS_LOAD_ERROR } from '../../lib/product-messages'
import { chosenProductType } from '../../lib/product-route'

// A failed read the form waits for, with the Retry that reads it again; none while the
// reads are still loading.
type PendingProps = { error: string; onRetry: () => void } | { error: null; onRetry?: never }

function PendingBody({ error, onRetry }: PendingProps) {
    if (error === null) return <RecordLoadingBody testIdPrefix="product" />
    return (
        <View className="flex-1 pt-4">
            <ListBanner testIdPrefix="product" message={error} onRetry={onRetry} />
        </View>
    )
}

// The record surface before the form can mount.
function NewProductPending(props: PendingProps) {
    const surface = useDetailSurface()
    const { leave } = useProductNavigation()
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix="product"
            backLabel="Products and services"
            title="New product or service"
            onLeave={leave}
            footer={null}
        >
            <PendingBody {...props} />
        </RecordSurface>
    )
}

/**
 * A new product — `/a/books/products/new`. With no valid `?type=` it shows the type
 * chooser; with one, the form of that type.
 */
export default function NewProductScreen() {
    const { type } = useLocalSearchParams<{ type?: string }>()
    const access = useBooksAccess()
    const accounts = useFormAccounts()
    const chosen = chosenProductType(type, access.canWrite)
    if (access.isError) {
        return <NewProductPending error={PRODUCT_ACCESS_LOAD_ERROR} onRetry={access.retry} />
    }
    if (!access.isReady) return <NewProductPending error={null} />
    if (!chosen) return <ProductTypeChooser canWrite={access.canWrite} />
    if (accounts.isError) {
        return <NewProductPending error={PRODUCT_ACCOUNTS_LOAD_ERROR} onRetry={accounts.retry} />
    }
    if (!accounts.isReady) return <NewProductPending error={null} />

    // The form mounts after the accounts load, so the defaults are its first values. It
    // is keyed by the type, so a new `?type=` (Save and new after a type change) starts
    // the form again from that type's values.
    const createValues = newProductValues(chosen, accounts.accounts)
    return <ProductChild key={chosen} target={{ mode: 'new', type: chosen, createValues }} />
}
