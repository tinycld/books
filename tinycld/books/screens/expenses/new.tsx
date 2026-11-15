import { useLocalSearchParams } from 'expo-router'
import { DocumentScreen } from '../../components/documents/DocumentScreen'
import { EXPENSE_DOCUMENT } from '../../components/documents/document-kinds'

// `vendor` prefills the vendor; `fresh` is a new key for each New expense, so a second new
// form mounts blank. `replaces` edits a posted expense, `copy` starts from one. An expense
// has no PDF view, so it reads no `tab`.
export default function NewExpenseRoute() {
    const params = useLocalSearchParams<{
        vendor?: string
        fresh?: string
        replaces?: string
        copy?: string
    }>()
    return (
        <DocumentScreen
            document={EXPENSE_DOCUMENT}
            id={null}
            vendor={params.vendor}
            fresh={params.fresh}
            replaces={params.replaces}
            copy={params.copy}
        />
    )
}
