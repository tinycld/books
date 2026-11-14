import { useState } from 'react'
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

interface ScreenStateProps {
    data: DocumentScreenData
    tab: DocumentTab
    // Counts the reloads of this screen: each one mounts a new form.
    reloads: number
    // Rejects, and mounts no new form, when the stored document cannot be read.
    onReload: () => Promise<void>
}

function ScreenState({ data, tab, reloads, onReload }: ScreenStateProps) {
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
            return (
                <DocumentForm
                    key={`${data.formKey}:${reloads}`}
                    data={data}
                    tab={tab}
                    onReload={onReload}
                />
            )
    }
}

/**
 * A sales document route's one screen: it loads the document of the kind (or nothing, on
 * a new form) and shows the state `documentScreenState` names, on the tab the `tab` param
 * names. The kind is provided once to every component under it. The form is keyed on its
 * form key and the screen's reload count, so a new route (another id, or a fresh `new`)
 * and a reload each mount a fresh form; a tab change keeps it.
 */
export function DocumentScreen({
    document: documentKind,
    tab: tabParam,
    ...input
}: DocumentScreenInput & { document: DocumentKind; tab?: string }) {
    const data = useDocumentScreen(documentKind, input)
    // A kind without a PDF has no tabs: a `tab` param in its URL shows the form.
    const tab = documentKind.doc.features.pdf ? documentTabOf(tabParam) : 'edit'
    const reloadRows = documentKind.data.useReload()
    // A reload mounts a new form on the stored document: the old form's typed values go
    // with it. Local to this screen: no other component reads it.
    const [reloads, setReloads] = useState(0)
    // The store can be behind the server (a realtime message that did not arrive), and a
    // form built from it would be refused again, so the rows are read again first. A
    // failed read rejects before the count moves: the form stays, with what is typed in
    // it, and shows the failure (useDocumentSave `reload`).
    const onReload = async () => {
        await reloadRows()
        setReloads(count => count + 1)
    }
    return (
        <DocumentKindContext.Provider value={documentKind}>
            <ScreenState data={data} tab={tab} reloads={reloads} onReload={onReload} />
        </DocumentKindContext.Provider>
    )
}
