import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { BILL_DOCUMENT } from '../../components/documents/document-kinds'

// `vendor` prefills the vendor; `fresh` is a new key for each New bill, so a second new
// form mounts blank. `replaces` edits a posted bill, `copy` starts from one. A bill has no
// PDF view, so it reads no `tab`.
export default function NewBillRoute() {
    const params = useLocalSearchParams<{
        vendor?: string
        fresh?: string
        replaces?: string
        copy?: string
    }>()
    return (
        <DocumentScreen
            document={BILL_DOCUMENT}
            id={null}
            vendor={params.vendor}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
        />
    )
}
