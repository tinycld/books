import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { CREDIT_MEMO_DOCUMENT } from '../../components/documents/document-kinds'

// `customer` prefills the customer; `fresh` is a new key for each New credit memo, so a
// second new form mounts blank. `replaces` edits a posted credit memo, `copy` starts from
// one, `invoice` starts from a posted invoice (Create credit memo). `tab=pdf` opens the
// PDF view tab.
export default function NewCreditMemoRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        replaces?: string
        copy?: string
        invoice?: string
        tab?: string
    }>()
    return (
        <DocumentScreen
            document={CREDIT_MEMO_DOCUMENT}
            id={null}
            customer={params.customer}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
            invoice={params.invoice}
            tab={params.tab}
        />
    )
}
