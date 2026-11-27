import { useEffect, useState } from 'react'
import { View } from 'react-native'
import type { DocumentScreenInput } from '../../hooks/document-data'
import { type DocumentScreenData, useDocumentScreen } from '../../hooks/useDocumentScreen'
import { type DocumentTab, documentTabOf } from '../../lib/document-routes'
import { ESTIMATE_KIND } from '../../lib/sales-document-kinds'
import { formSessionKey, useAttachmentsStore } from '../../stores/attachments-store'
import { DocumentForm } from './DocumentForm'
import { DocumentLoadError } from './DocumentLoadError'
import { DocumentLoading } from './DocumentLoading'
import { DocumentNotice } from './DocumentNotice'
import { DocumentReadView, type ReadNoticeView } from './DocumentReadView'
import { DocumentKindContext, useDocumentKind } from './document-kind-context'
import type { DocumentKind } from './document-kinds'

// `read` comes with the record loaded; the check keeps the type honest. `notice` is a line
// under the title (a closed order's `?edit=1`: it cannot be edited).
function ReadState({
    data,
    tab,
    notice,
}: {
    data: DocumentScreenData
    tab: DocumentTab
    notice?: ReadNoticeView
}) {
    if (!data.record) return <DocumentLoading />
    return <DocumentReadView data={data} record={data.record} tab={tab} notice={notice} />
}

interface ScreenStateProps {
    data: DocumentScreenData
    tab: DocumentTab
    // Counts the reloads of this screen: each one mounts a new form.
    reloads: number
    // Rejects, and mounts no new form, when the stored document cannot be read.
    onReload: () => Promise<void>
    // The form's attachments session; '' for a kind without attachments.
    attachmentSession: string
    // Whether a form here focuses its first field (useOpensForm).
    focusesFirstField: boolean
}

function ScreenState({
    data,
    tab,
    reloads,
    onReload,
    attachmentSession,
    focusesFirstField,
}: ScreenStateProps) {
    const { messages, testId } = useDocumentKind().doc
    const ids = {
        notFound: `${testId}-not-found`,
        noAccess: `${testId}-no-access`,
        cannotEdit: `${testId}-cannot-edit`,
        cannotConvert: `${testId}-cannot-convert`,
        closedNotice: `${testId}-closed-notice`,
    }
    // A closed order's `?edit=1` (purchase order spec §3.12): its read view, with the kind's
    // words that it cannot be edited.
    const closedNotice = { testID: ids.closedNotice, message: messages.cannotEdit }
    // Only an invoice is made from an estimate; the estimate's words say it cannot be.
    const { cannotConvert } = ESTIMATE_KIND.messages
    // A source the kind refuses (DocumentKind.sourceNotice: a credit memo's invoice, a
    // refund's sales receipt or credit memo) has the kind's own words and id; a kind that
    // gives none shows the not-found notice.
    const cannotStart = data.sourceNotice ?? { testId: ids.notFound, message: messages.notFound }
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
        case 'cannot-start':
            return <DocumentNotice testID={cannotStart.testId} message={cannotStart.message} />
        case 'read':
            return <ReadState data={data} tab={tab} />
        case 'closed-edit':
            return <ReadState data={data} tab={tab} notice={closedNotice} />
        case 'form':
            return (
                <DocumentForm
                    key={`${data.formKey}:${reloads}`}
                    data={data}
                    tab={tab}
                    onReload={onReload}
                    attachmentSession={attachmentSession}
                    focusesFirstField={focusesFirstField}
                />
            )
    }
}

/**
 * Whether a form on this screen opens it: true until the screen shows the document's read
 * view. A form that replaces the read view later (the document became editable under the
 * screen: its invoice deleted or voided, a realtime update) comes from a data change, not
 * from the user opening the form, so it takes no focus. Else its first field would take
 * the focus only when the update happens to arrive while the screen shows, and a key
 * pressed for the app (`/`) would go into that field.
 */
function useOpensForm(state: DocumentScreenData['state']): boolean {
    // Local to this screen: no other component reads it.
    const [hasShownRead, setHasShownRead] = useState(false)
    if (state === 'read' && !hasShownRead) setHasShownRead(true)
    return !hasShownRead
}

/**
 * The form's session of pending attachments (spec §3.2), `form:<formKey>`, open while
 * this screen is mounted. The screen holds it, not the form: a conflict reload mounts a
 * new form under the same key, and the pending files stay. A new form's key holds until
 * its save navigates, and a save navigates only after its attachments step stored every
 * file, so no pending file is dropped by it.
 */
function useFormAttachmentSession(documentKind: DocumentKind, formKey: string): string {
    const sessionKey = documentKind.doc.features.attachments ? formSessionKey(formKey) : ''
    useEffect(() => {
        if (sessionKey === '') return
        const store = useAttachmentsStore.getState()
        store.open(sessionKey)
        return () => store.drop(sessionKey)
    }, [sessionKey])
    return sessionKey
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
    const attachmentSession = useFormAttachmentSession(documentKind, data.formKey)
    const focusesFirstField = useOpensForm(data.state)
    // The store can be behind the server (a realtime message that did not arrive), and a
    // form built from it would be refused again, so the rows are read again first. A
    // failed read rejects before the count moves: the form stays, with what is typed in
    // it, and shows the failure (useDocumentSave `reload`).
    const onReload = async () => {
        await reloadRows()
        setReloads(count => count + 1)
    }
    // The root opts back into pointer events and draws its own background: a sales kind's
    // child stack (DocumentKindLayout) turns pointer events off on web and draws its screens
    // over a transparent layer, so the list under it never takes the document's clicks.
    return (
        <DocumentKindContext.Provider value={documentKind}>
            <View pointerEvents="auto" className="flex-1 bg-background">
                <ScreenState
                    data={data}
                    tab={tab}
                    reloads={reloads}
                    onReload={onReload}
                    attachmentSession={attachmentSession}
                    focusesFirstField={focusesFirstField}
                />
            </View>
        </DocumentKindContext.Provider>
    )
}
