import { PickMenu } from '@tinycld/core/ui/pick-menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import {
    clearMatchedText,
    RECONCILE_SHOW_LABELS,
    RECONCILE_TEXTS,
    type ReconcileShow,
    type ReconcileSide,
} from '../../lib/reconcile'
import { useReconcileStore } from '../../stores/reconcile-store'
import { ListTabs } from '../ListTabs'
import { SearchField } from '../ListToolbar'

const MATCHED_KEY = { keys: 'm', scope: 'list' } as const
const SHOW_CHOICES: readonly ReconcileShow[] = ['all', 'uncleared', 'cleared']
const LINK_STYLE = { minHeight: 44 }

function isSide(key: string): key is ReconcileSide {
    return key === 'all' || key === 'out' || key === 'in'
}

// All · Payments · Deposits (Charges and Payments for a card, sideWords).
function SideTabs({ model }: { model: ReconcileScreenModel }) {
    const setSide = useReconcileStore(s => s.setSide)
    const tabs = [
        { key: 'all', label: 'All' },
        { key: 'out', label: model.words.out },
        { key: 'in', label: model.words.in },
    ]
    const onSelect = (key: string) => {
        if (isSide(key)) setSide(key)
    }
    return (
        <ListTabs
            tabs={tabs}
            selected={model.filters.side}
            testIdPrefix="reconcile-side"
            onSelect={onSelect}
        />
    )
}

// The store holds the text as typed; the screen applies it after SEARCH_DELAY_MS. `/`
// focuses the field through the screen's `searchRef`.
function SearchBox({ model }: { model: ReconcileScreenModel }) {
    const setSearch = useReconcileStore(s => s.setSearch)
    const list = { query: model.filters.search, setQuery: setSearch }
    return (
        <SearchField
            testIdPrefix="reconcile"
            placeholder={RECONCILE_TEXTS.searchPlaceholder}
            list={list}
            isWide={model.isWide}
            inputRef={model.searchRef}
            size="touch"
        />
    )
}

function ShowMenu({ show }: { show: ReconcileShow }) {
    const setShow = useReconcileStore(s => s.setShow)
    const items = SHOW_CHOICES.map(id => ({
        id,
        label: RECONCILE_SHOW_LABELS[id],
        isSelected: id === show,
        onSelect: () => setShow(id),
    }))
    return (
        <PickMenu
            testID="reconcile-show"
            purpose="Show"
            label={RECONCILE_SHOW_LABELS[show]}
            size="touch"
            items={items}
        />
    )
}

// Writers only, while one or more rows that are not cleared are matched to a bank
// transaction; it clears all of them, whatever the filters. Its key M is registered by
// the button itself in the screen's scope (`scopeOwner`).
function ClearMatchedButton({ model }: { model: ReconcileScreenModel }) {
    const { clear } = model
    if (!model.canWrite || clear.matchedCount === 0) return null
    return (
        <ShortcutButton
            testID="reconcile-clear-matched"
            label={clearMatchedText(clear.matchedCount)}
            shortcut={MATCHED_KEY}
            onPress={clear.onClearMatched}
            serverAction
            variant="outline"
            isDisabled={clear.isBatchRunning}
            className="min-h-11"
            scopeOwner={model.scopeOwner}
        />
    )
}

function ClearFiltersLink({ isVisible }: { isVisible: boolean }) {
    const resetFilters = useReconcileStore(s => s.resetFilters)
    if (!isVisible) return null
    return (
        <Pressable
            testID="reconcile-clear-filters"
            accessibilityRole="button"
            onPress={resetFilters}
            className="justify-center px-1"
            style={LINK_STYLE}
        >
            <Text className="text-sm font-medium text-primary">{RECONCILE_TEXTS.clearFilters}</Text>
        </Pressable>
    )
}

// The last batch result or refusal, until the next action; a refusal in text-danger. The
// live region is always mounted and only its text changes: a region that mounts together
// with its first text is often not announced on the web. Empty, it has no height (h-0,
// also on Android, which gives an empty Text one line) and no margin, so the list does
// not move.
function ResultLine({ model }: { model: ReconcileScreenModel }) {
    const { result } = model
    const tone = result?.tone === 'danger' ? 'text-danger' : 'text-muted-foreground'
    const spacing = result ? 'mt-2' : 'h-0'
    const text = result?.text ?? ''
    return (
        <Text
            testID="reconcile-result"
            accessibilityLiveRegion="polite"
            className={`text-sm ${tone} ${spacing}`}
        >
            {text}
        </Text>
    )
}

/**
 * The work screen's toolbar (reconcile spec §3 "Toolbar"): the side tabs, then the search,
 * Show, "Clear filters" and Clear matched (one row on wide, the search alone on a phone
 * with the other controls under it), and the result line under them. The side, the
 * search and the Show choice live in stores/reconcile-store.ts. A reader keeps every
 * filter and has no Clear matched.
 */
export function ReconcileToolbar({ model }: { model: ReconcileScreenModel }) {
    const layout = model.isWide ? 'flex-row flex-wrap items-center gap-2' : 'gap-2'
    return (
        <View testID="reconcile-toolbar">
            <View className="gap-2">
                <SideTabs model={model} />
                <View className={layout}>
                    <SearchBox model={model} />
                    <View className="flex-row flex-wrap items-center gap-2">
                        <ShowMenu show={model.filters.show} />
                        <ClearFiltersLink isVisible={model.hasFilter} />
                        <ClearMatchedButton model={model} />
                    </View>
                </View>
            </View>
            <ResultLine model={model} />
        </View>
    )
}
