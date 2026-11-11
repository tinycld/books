import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { type ReactNode, useId, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { INVOICE_SHORTCUT_GROUP } from '../../hooks/useInvoiceShortcuts'
import { INVOICE_TAB_KEYS } from '../../lib/invoice-actions'
import type { DocumentTab } from '../../lib/invoice-routes'

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
    const isSelected = tab === selected
    const state = isSelected ? 'selected' : 'idle'
    const onPress = () => openDocumentTab(tab)
    // react-native-web draws `aria-selected` from the aria prop only, not from
    // accessibilityState; native reads accessibilityState.
    return (
        <Pressable
            testID={`invoice-tab-${tab}`}
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
function useTabKeys(firstLabel: string, scopeOwner: ScopeOwner) {
    const instance = useId()
    const shortcuts = useMemo<Shortcut[]>(
        () => [
            {
                id: `books.invoice.tabs.${instance}.edit`,
                keys: INVOICE_TAB_KEYS.edit,
                scope: 'compose',
                description: `${firstLabel} tab`,
                group: INVOICE_SHORTCUT_GROUP,
                allowInInputs: true,
                run: () => openDocumentTab('edit'),
            },
            {
                id: `books.invoice.tabs.${instance}.pdf`,
                keys: INVOICE_TAB_KEYS.pdf,
                scope: 'compose',
                description: 'PDF view tab',
                group: INVOICE_SHORTCUT_GROUP,
                allowInInputs: true,
                run: () => openDocumentTab('pdf'),
            },
        ],
        [instance, firstLabel]
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
 * selected tab is the `tab` search param, so a reload or a shared link keeps it.
 */
export function DocumentTabs({ selected, firstLabel, scopeOwner }: DocumentTabsProps) {
    useTabKeys(firstLabel, scopeOwner)
    return (
        <View accessibilityRole="tablist" className="flex-row gap-6 border-b border-border">
            <Tab tab="edit" label={firstLabel} selected={selected} />
            <Tab tab="pdf" label="PDF view" selected={selected} />
        </View>
    )
}
