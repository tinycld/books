import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import {
    type Scope,
    type ScopeOwner,
    type Shortcut,
    useRegisterShortcut,
} from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
import {
    type LayoutChangeEvent,
    Pressable,
    ScrollView,
    type ScrollViewInstance,
    Text,
    View,
} from 'react-native'

export type RecordTab<K extends string> = { key: K; label: string; keys: string }

// The first tab has no param, so its URL is the record's own.
export function selectRecordTab(firstKey: string, key: string) {
    router.setParams({ tab: key === firstKey ? undefined : key })
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

const STRIP_CLASS = 'flex-row gap-6 border-b border-border'

// A horizontal ScrollView sizes its content to the tabs; at least the strip's full width,
// the rule under the tabs spans the screen as it does on a wide window.
const PHONE_STRIP_CONTENT = { minWidth: '100%' } as const

interface TabProps<K extends string> {
    tab: RecordTab<K>
    isSelected: boolean
    testID: string
    shortcutId: string
    shortcutGroup: string
    keysScope: Scope
    keysScopeOwner: ScopeOwner
    onSelect: (key: K) => void
    onTabLayout: (key: K, x: number) => void
}

// Each tab owns its key (⌥<n>), which selects it from anywhere on the screen, a text
// field included.
function Tab<K extends string>({
    tab,
    isSelected,
    testID,
    shortcutId,
    shortcutGroup,
    keysScope,
    keysScopeOwner,
    onSelect,
    onTabLayout,
}: TabProps<K>) {
    const { key, label, keys } = tab
    const shortcut = useMemo<Shortcut>(
        () => ({
            id: shortcutId,
            keys,
            scope: keysScope,
            description: `${label} tab`,
            group: shortcutGroup,
            allowInInputs: true,
            run: () => onSelect(key),
        }),
        [shortcutId, keys, keysScope, label, shortcutGroup, onSelect, key]
    )
    useRegisterShortcut(shortcut, keysScopeOwner)
    const state = isSelected ? 'selected' : 'idle'
    const onPress = () => onSelect(key)
    const onLayout = (event: LayoutChangeEvent) => onTabLayout(key, event.nativeEvent.layout.x)
    // react-native-web draws `aria-selected` from the aria prop only, not from
    // accessibilityState; native reads accessibilityState.
    return (
        <Pressable
            testID={testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            onPress={onPress}
            onLayout={onLayout}
            className={TAB_CLASS[state]}
            style={TAP}
        >
            <Text className={LABEL_CLASS[state]}>{label}</Text>
        </Pressable>
    )
}

// The tabs' x offsets, kept in a ref: only the scroll effect reads them, so a layout
// never renders. When `selected` changes, the phone strip scrolls that tab into view.
function useScrollSelectedIntoView(selected: string, isScrolling: boolean) {
    const scrollRef = useRef<ScrollViewInstance | null>(null)
    const offsets = useRef(new Map<string, number>())
    const onTabLayout = (key: string, x: number) => {
        offsets.current.set(key, x)
    }
    useEffect(() => {
        if (!isScrolling) return
        const x = offsets.current.get(selected)
        if (x === undefined) return
        scrollRef.current?.scrollTo({ x, animated: true })
    }, [selected, isScrolling])
    return { scrollRef, onTabLayout }
}

interface RecordTabsProps<K extends string> {
    tabs: readonly RecordTab<K>[]
    selected: K
    onSelect: (key: K) => void
    testIdPrefix: string
    keysScopeOwner: ScopeOwner
    // The scope `keysScopeOwner` pushed: `compose` on a document form, `modal` inside a
    // RecordSurface, whose scope is the top one on a record page.
    keysScope?: Scope
    shortcutIdPrefix: string
    shortcutGroup: string
    // Added to the strip, e.g. the page's gutter, so the strip's rule spans the page.
    stripClassName?: string
}

/**
 * The tab strip under a record's title. The caller keeps the selected tab (a `tab`
 * search param, through `selectRecordTab`), so a reload or a shared link keeps it. On a
 * phone the strip scrolls sideways and the selected tab scrolls into view.
 */
export function RecordTabs<K extends string>({
    tabs,
    selected,
    onSelect,
    testIdPrefix,
    keysScopeOwner,
    keysScope = 'compose',
    shortcutIdPrefix,
    shortcutGroup,
    stripClassName = '',
}: RecordTabsProps<K>) {
    const isPhone = useBreakpoint() === 'mobile'
    const stripClass = `${STRIP_CLASS} ${stripClassName}`
    const { scrollRef, onTabLayout } = useScrollSelectedIntoView(selected, isPhone)
    const items = tabs.map(tab => (
        <Tab<K>
            key={tab.key}
            tab={tab}
            isSelected={tab.key === selected}
            testID={`${testIdPrefix}-tab-${tab.key}`}
            shortcutId={`${shortcutIdPrefix}.${tab.key}`}
            shortcutGroup={shortcutGroup}
            keysScope={keysScope}
            keysScopeOwner={keysScopeOwner}
            onSelect={onSelect}
            onTabLayout={onTabLayout}
        />
    ))
    if (isPhone) {
        return (
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                accessibilityRole="tablist"
                contentContainerClassName={stripClass}
                contentContainerStyle={PHONE_STRIP_CONTENT}
            >
                {items}
            </ScrollView>
        )
    }
    return (
        <View accessibilityRole="tablist" className={stripClass}>
            {items}
        </View>
    )
}
