import { VendorChild } from '../../components/vendors/VendorChild'

/** A new vendor — `/a/books/vendors/new`. */
export default function NewVendorScreen() {
    return <VendorChild target={{ mode: 'new' }} />
}
