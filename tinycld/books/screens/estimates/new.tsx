import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { ESTIMATE_DOCUMENT } from '../../components/documents/document-kinds'

// `customer` prefills the customer; `fresh` is a new key for each New estimate, so a
// second new form mounts blank. `copy` starts from an estimate. `tab=pdf` opens the PDF
// view tab. An estimate has no correction, so there is no `replaces`.
export default function NewEstimateRoute() {
    const params = useLocalSearchParams<{
        customer?: string
        fresh?: string
        copy?: string
        tab?: string
    }>()
    return (
        <DocumentScreen
            document={ESTIMATE_DOCUMENT}
            id={null}
            customer={params.customer}
            fresh={params.fresh}
            copy={params.copy}
            tab={params.tab}
        />
    )
}
