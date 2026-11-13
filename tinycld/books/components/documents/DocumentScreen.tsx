import type { DocumentScreenInput } from '../../hooks/document-data'
import { type DocumentScreenData, useDocumentScreen } from '../../hooks/useDocumentScreen'
import { type DocumentTab, documentTabOf } from '../../lib/document-routes'
import { ESTIMATE_KIND } from '../../lib/sales-document-kinds'
import { DocumentForm } from './DocumentForm'
import { DocumentLoadError } from './DocumentLoadError'
import { DocumentLoading } from './DocumentLoading'
import { DocumentNotice } from './DocumentNotice'
import { DocumentReadView } from './DocumentReadView'
import { DocumentKindContext, useDocumentKind } from './document-kind-context'
import type { DocumentKind } from './document-kinds'

// `read` comes with the record loaded; the check keeps the type honest.
function ReadState({ data, tab }: { data: DocumentScreenData; tab: DocumentTab }) {
    if (!data.record) return <DocumentLoading />
    return <DocumentReadView data={data} record={data.record} tab={tab} />
}

function ScreenState({ data, tab }: { data: DocumentScreenData; tab: DocumentTab }) {
    const { messages, testId } = useDocumentKind().doc
    const ids = {
        notFound: `${testId}-not-found`,
        noAccess: `${testId}-no-access`,
        cannotEdit: `${testId}-cannot-edit`,
        cannotConvert: `${testId}-cannot-convert`,
    }
    // Only an invoice is made from an estimate; the estimate's words say it cannot be.
    const { cannotConvert } = ESTIMATE_KIND.messages
    switch (data.state) {
        case 'loading':
            return <DocumentLoading />
        case 'error':
            return <DocumentLoadError message={data.errorText} onRetry={data.retry} />
        case 'not-found':
            return <DocumentNotice testID={ids.notFound} message={messages.notFound} />
        case 'no-access':
            return <DocumentNotice testID={ids.noAccess} message={messages.noAccess} />
        case 'cannot-edit':
            return <DocumentNotice testID={ids.cannotEdit} message={messages.cannotEdit} />
        case 'cannot-convert':
            return <DocumentNotice testID={ids.cannotConvert} message={cannotConvert} />
        case 'read':
            return <ReadState data={data} tab={tab} />
        case 'form':
            return <DocumentForm key={data.formKey} data={data} tab={tab} />
    }
}

/**
 * A sales document route's one screen: it loads the document of the kind (or nothing, on
 * a new form) and shows the state `documentScreenState` names, on the tab the `tab` param
 * names. The kind is provided once to every component under it. The form is keyed on its
 * form key, so a new route (another id, or a fresh `new`) mounts a fresh form; a tab
 * change keeps it.
 */
export function DocumentScreen({
    document: documentKind,
    tab: tabParam,
    ...input
}: DocumentScreenInput & { document: DocumentKind; tab?: string }) {
    const data = useDocumentScreen(documentKind, input)
    // A kind without a PDF has no tabs: a `tab` param in its URL shows the form.
    const tab = documentKind.doc.features.pdf ? documentTabOf(tabParam) : 'edit'
    return (
        <DocumentKindContext.Provider value={documentKind}>
            <ScreenState data={data} tab={tab} />
        </DocumentKindContext.Provider>
    )
}
