import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { type ReactNode, useId, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { DOCUMENT_TAB_KEYS } from '../../lib/document-actions'
import type { DocumentTab } from '../../lib/document-routes'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { useDocumentKind } from './document-kind-context'

// The first tab has no param, so its URL is the record's own.
export function openDocumentTab(tab: DocumentTab) {
    router.setParams({ tab: tab === 'pdf' ? 'pdf' : undefined })
}

// One tab's content. The other tab's is not mounted, so its keys and queries are idle.
export function TabPanel({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return <>{children}</>
}

const TAB_CLASS = {
    selected: '-mb-px border-b-2 border-primary px-1 pb-2.5',
    idle: '-mb-px border-b-2 border-transparent px-1 pb-2.5',
} as const

const LABEL_CLASS = {
    selected: 'text-sm font-semibold text-foreground',
    idle: 'text-sm font-medium text-muted-foreground',
} as const

const TAP = { minHeight: 44, justifyContent: 'flex-end' } as const

interface TabProps {
    tab: DocumentTab
    label: string
    selected: DocumentTab
}

function Tab({ tab, label, selected }: TabProps) {
    const { doc } = useDocumentKind()
    const isSelected = tab === selected
    const state = isSelected ? 'selected' : 'idle'
    const onPress = () => openDocumentTab(tab)
    const testID = `${doc.testId}-tab-${tab}`
    // react-native-web draws `aria-selected` from the aria prop only, not from
    // accessibilityState; native reads accessibilityState.
    return (
        <Pressable
            testID={testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            onPress={onPress}
            className={TAB_CLASS[state]}
            style={TAP}
        >
            <Text className={LABEL_CLASS[state]}>{label}</Text>
        </Pressable>
    )
}

// ⌥1 and ⌥2 open the tabs from anywhere on the screen, a text field included.
function useTabKeys(
    kind: Pick<SalesDocumentKind, 'key' | 'shortcutGroup'>,
    firstLabel: string,
    scopeOwner: ScopeOwner
) {
    const instance = useId()
    const { key: kindKey, shortcutGroup: group } = kind
    const shortcuts = useMemo<Shortcut[]>(
        () => [
            {
                id: `books.${kindKey}.tabs.${instance}.edit`,
                keys: DOCUMENT_TAB_KEYS.edit,
                scope: 'compose',
                description: `${firstLabel} tab`,
                group,
                allowInInputs: true,
                run: () => openDocumentTab('edit'),
            },
            {
                id: `books.${kindKey}.tabs.${instance}.pdf`,
                keys: DOCUMENT_TAB_KEYS.pdf,
                scope: 'compose',
                description: 'PDF view tab',
                group,
                allowInInputs: true,
                run: () => openDocumentTab('pdf'),
            },
        ],
        [instance, firstLabel, kindKey, group]
    )
    useRegisterShortcuts(shortcuts, scopeOwner)
}

interface DocumentTabsProps {
    selected: DocumentTab
    // "Edit" on the form, "Details" on the read view.
    firstLabel: 'Edit' | 'Details'
    scopeOwner: ScopeOwner
}

/**
 * The tabs under a document's title: the form or its details, and the PDF view. The
 * selected tab is the `tab` search param, so a reload or a shared link keeps it. A kind
 * without a PDF (`features.pdf`) draws no tabs and registers no ⌥1 / ⌥2.
 */
export function DocumentTabs(props: DocumentTabsProps) {
    const { doc } = useDocumentKind()
    if (!doc.features.pdf) return null
    return <TabRow {...props} />
}

function TabRow({ selected, firstLabel, scopeOwner }: DocumentTabsProps) {
    const { doc } = useDocumentKind()
    useTabKeys(doc, firstLabel, scopeOwner)
    return (
        <View accessibilityRole="tablist" className="flex-row gap-6 border-b border-border">
            <Tab tab="edit" label={firstLabel} selected={selected} />
            <Tab tab="pdf" label="PDF view" selected={selected} />
        </View>
    )
}
