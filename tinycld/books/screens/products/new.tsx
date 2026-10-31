import { useLocalSearchParams } from 'expo-router'
import { ProductChild } from '../../components/products/ProductChild'
import { ProductTypeChooser } from '../../components/products/ProductTypeChooser'
import { RecordLoadingBody, RecordSurface } from '../../components/RecordSurface'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useFormAccounts } from '../../hooks/useFormAccounts'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { newProductValues } from '../../lib/product-defaults'
import { chosenProductType } from '../../lib/product-route'

function NewProductLoading() {
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
            <RecordLoadingBody testIdPrefix="product" />
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
    if (!access.isReady || (chosen && !accounts.isReady)) return <NewProductLoading />
    if (!chosen) return <ProductTypeChooser canWrite={access.canWrite} />
    // The form mounts after the accounts load, so the defaults are its first values.
    const createValues = newProductValues(chosen, accounts.accounts)
    return <ProductChild key={chosen} target={{ mode: 'new', type: chosen, createValues }} />
}
