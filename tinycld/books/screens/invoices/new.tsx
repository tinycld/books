import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { INVOICE_DOCUMENT } from '../../components/documents/document-kinds'

// `customer` prefills the customer; `fresh` is a new key for each New invoice, so a
// second new form mounts blank. `replaces` edits a posted invoice, `copy` starts from
// one. `tab=pdf` opens the PDF view tab.
export default function NewInvoiceRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
        tab?: string
    }>()
    return (
        <DocumentScreen
            document={INVOICE_DOCUMENT}
            id={null}
            customer={params.customer}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
            tab={params.tab}
        />
    )
}
