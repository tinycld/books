import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { type ReactNode, useId, useMemo } from 'react'
import { DOCUMENT_TAB_KEYS } from '../../lib/document-actions'
import type { DocumentTab } from '../../lib/document-routes'
import { RecordTabs, selectRecordTab } from '../RecordTabs'
import { useDocumentKind } from './document-kind-context'

// The first tab has no param, so its URL is the record's own.
export function openDocumentTab(tab: DocumentTab) {
    selectRecordTab('edit', tab)
}

// One tab's content. The other tab's is not mounted, so its keys and queries are idle.
export function TabPanel({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return <>{children}</>
}

interface DocumentTabsProps {
    selected: DocumentTab
    // "Edit" on the form, "Details" on the read view.
    firstLabel: 'Edit' | 'Details'
    scopeOwner: ScopeOwner
}

/**
 * The tabs under a document's title: the form or its details, and the PDF view. The
 * selected tab is the `tab` search param, so a reload or a shared link keeps it. ⌥1 and
 * ⌥2 open the tabs from anywhere on the screen, a text field included.
 */
export function DocumentTabs({ selected, firstLabel, scopeOwner }: DocumentTabsProps) {
    const { doc } = useDocumentKind()
    const instance = useId()
    const tabs = useMemo(
        () =>
            [
                { key: 'edit', label: firstLabel, keys: DOCUMENT_TAB_KEYS.edit },
                { key: 'pdf', label: 'PDF view', keys: DOCUMENT_TAB_KEYS.pdf },
            ] as const,
        [firstLabel]
    )
    return (
        <RecordTabs<DocumentTab>
            tabs={tabs}
            selected={selected}
            onSelect={openDocumentTab}
            testIdPrefix={doc.testId}
            keysScopeOwner={scopeOwner}
            shortcutIdPrefix={`books.${doc.key}.tabs.${instance}`}
            shortcutGroup={doc.shortcutGroup}
        />
    )
}
