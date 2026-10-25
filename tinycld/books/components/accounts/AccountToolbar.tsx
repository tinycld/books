import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Popover } from '@tinycld/core/ui/popover'
import { router } from 'expo-router'
import { Search } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { useAccountTree } from '../../hooks/useAccountTree'
import type { AccountGroup } from '../../lib/account-types'
import { BatchActions } from './BatchActions'

type Tree = ReturnType<typeof useAccountTree>

interface AccountToolbarProps {
    tree: Tree
    canWrite: boolean
    isWide: boolean
    onNew: () => void
    selectedCount: number
    onMakeInactive: () => void
    isWorking: boolean
}

const FILTER_CHIPS: { group: AccountGroup; label: string }[] = [
    { group: 'asset', label: 'Assets' },
    { group: 'liability', label: 'Liabilities' },
    { group: 'equity', label: 'Equity' },
    { group: 'income', label: 'Income' },
    { group: 'expense', label: 'Expenses' },
]

interface FilterChipProps {
    testID: string
    label: string
    isActive: boolean
    role: 'button' | 'switch'
    onPress: () => void
}

function FilterChip({ testID, label, isActive, role, onPress }: FilterChipProps) {
    const bg = isActive ? 'bg-primary border-primary' : 'bg-background border-border'
    const text = isActive ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID={testID}
            accessibilityRole={role}
            accessibilityState={role === 'switch' ? { checked: isActive } : { selected: isActive }}
            onPress={onPress}
            className={`rounded-full border px-3 py-1 ${bg}`}
            style={{ minHeight: 32, justifyContent: 'center' }}
        >
            <Text className={`text-sm ${text}`}>{label}</Text>
        </Pressable>
    )
}

function SearchField({ query, onChange }: { query: string; onChange: (value: string) => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <View
            className="flex-1 flex-row items-center gap-2 rounded-md border border-border bg-background px-3"
            style={{ minHeight: 40, minWidth: 160, maxWidth: 360 }}
        >
            <Search size={16} color={color} />
            <PlainInput
                testID="account-search"
                accessibilityLabel="Search accounts"
                placeholder="Filter by name or number"
                value={query}
                onChangeText={onChange}
                className="flex-1 text-sm text-foreground"
            />
        </View>
    )
}

function GroupChips({ tree }: { tree: Tree }) {
    const { group, setGroup } = tree
    const chips = FILTER_CHIPS.map(chip => (
        <FilterChip
            key={chip.group}
            testID={`account-filter-${chip.group}`}
            label={chip.label}
            isActive={group === chip.group}
            role="button"
            onPress={() => setGroup(group === chip.group ? '' : chip.group)}
        />
    ))
    return <View className="flex-row flex-wrap items-center gap-2">{chips}</View>
}

function ShowInactiveToggle({ tree }: { tree: Tree }) {
    const { showInactive, setShowInactive } = tree
    return (
        <FilterChip
            testID="account-show-inactive"
            label="Show inactive"
            isActive={showInactive}
            role="switch"
            onPress={() => setShowInactive(!showInactive)}
        />
    )
}

function WideFilters({ isVisible, tree }: { isVisible: boolean; tree: Tree }) {
    if (!isVisible) return null
    return (
        <View className="flex-row flex-wrap items-center gap-2">
            <GroupChips tree={tree} />
            <ShowInactiveToggle tree={tree} />
        </View>
    )
}

function PhoneFilters({ isVisible, tree }: { isVisible: boolean; tree: Tree }) {
    if (!isVisible) return null
    const activeCount = (tree.group === '' ? 0 : 1) + (tree.showInactive ? 1 : 0)
    const label = activeCount > 0 ? `Filters (${activeCount})` : 'Filters'
    return (
        <Popover
            title="Filters"
            trigger={
                <Pressable
                    testID="account-filter-button"
                    accessibilityRole="button"
                    className="items-center justify-center rounded-md border border-border bg-background px-3"
                    style={{ minHeight: 40 }}
                >
                    <Text className="text-sm text-foreground">{label}</Text>
                </Pressable>
            }
        >
            <View className="gap-3 p-3">
                <GroupChips tree={tree} />
                <View className="flex-row">
                    <ShowInactiveToggle tree={tree} />
                </View>
            </View>
        </Popover>
    )
}

function ToggleAllButton({ tree }: { tree: Tree }) {
    const isDisabled = !tree.canToggle || !tree.hasParents
    return (
        <Button
            testID="account-toggle-all"
            variant="outline"
            size="sm"
            isDisabled={isDisabled}
            accessibilityState={{ disabled: isDisabled }}
            aria-disabled={isDisabled}
            onPress={isDisabled ? undefined : tree.toggleAllCollapsed}
        >
            <ButtonText>{tree.areAllCollapsed ? 'Expand all' : 'Collapse all'}</ButtonText>
        </Button>
    )
}

function ImportLink({ isVisible }: { isVisible: boolean }) {
    const orgHref = useOrgHref()
    if (!isVisible) return null
    return (
        <Pressable
            testID="account-import-link"
            accessibilityRole="link"
            onPress={() => router.push(orgHref('books/accounts/import'))}
            className="items-center justify-center rounded-md border border-border bg-background px-3"
            style={{ minHeight: 32 }}
        >
            <Text className="text-sm text-foreground">Import</Text>
        </Pressable>
    )
}

function OpeningBalancesLink() {
    const orgHref = useOrgHref()
    return (
        <Pressable
            testID="account-opening-balances-link"
            accessibilityRole="link"
            onPress={() => router.push(orgHref('books/opening-balances'))}
            className="items-center justify-center rounded-md border border-border bg-background px-3"
            style={{ minHeight: 32 }}
        >
            <Text className="text-sm text-foreground">Opening balances</Text>
        </Pressable>
    )
}

function NewAccountButton({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="account-new-toolbar" size="sm" onPress={onNew}>
            <ButtonText>New account</ButtonText>
        </Button>
    )
}

function BatchSlot({
    isVisible,
    ...props
}: { isVisible: boolean } & Parameters<typeof BatchActions>[0]) {
    if (!isVisible) return null
    return <BatchActions {...props} />
}

export function AccountToolbar({
    tree,
    canWrite,
    isWide,
    onNew,
    selectedCount,
    onMakeInactive,
    isWorking,
}: AccountToolbarProps) {
    return (
        <View className="gap-3 px-4 pb-3">
            <View className="flex-row flex-wrap items-center gap-2">
                <SearchField query={tree.query} onChange={tree.setQuery} />
                <PhoneFilters isVisible={!isWide} tree={tree} />
                <BatchSlot
                    isVisible={canWrite && !isWide}
                    isIcon
                    selectedCount={selectedCount}
                    onMakeInactive={onMakeInactive}
                    isWorking={isWorking}
                />
                <WideFilters isVisible={isWide} tree={tree} />
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
                <ToggleAllButton tree={tree} />
                <ImportLink isVisible={canWrite} />
                <OpeningBalancesLink />
                <BatchSlot
                    isVisible={canWrite && isWide}
                    isIcon={false}
                    selectedCount={selectedCount}
                    onMakeInactive={onMakeInactive}
                    isWorking={isWorking}
                />
                <NewAccountButton isVisible={canWrite && isWide} onNew={onNew} />
            </View>
        </View>
    )
}
