import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { VENDOR_CREDIT_DOCUMENT } from '../../components/documents/document-kinds'

// `vendor` prefills the vendor; `fresh` is a new key for each New vendor credit, so a
// second new form mounts blank. `replaces` edits a posted vendor credit, `copy` starts from
// one. A vendor credit has no PDF view, so it reads no `tab`.
export default function NewVendorCreditRoute() {
    const params = useLocalSearchParams<{
        vendor?: string
        fresh?: string
        replaces?: string
        copy?: string
    }>()
    return (
        <DocumentScreen
            document={VENDOR_CREDIT_DOCUMENT}
            id={null}
            vendor={params.vendor}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
        />
    )
}
