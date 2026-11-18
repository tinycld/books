import { Pressable, ScrollView, Text } from 'react-native'

interface ListTabsProps {
    tabs: readonly { key: string; label: string }[]
    selected: string
    testIdPrefix: string
    onSelect(key: string): void
}

const TAB_CLASS = {
    selected: '-mb-px border-b-2 border-primary px-1 pb-2.5',
    idle: '-mb-px border-b-2 border-transparent px-1 pb-2.5',
} as const

const TAB_LABEL_CLASS = {
    selected: 'text-sm font-semibold text-foreground',
    idle: 'text-sm font-medium text-muted-foreground',
} as const

const TAB_TAP = { minHeight: 44, justifyContent: 'flex-end' } as const
const TAB_STRIP_CONTENT = { minWidth: '100%' } as const

interface TabProps {
    tabKey: string
    label: string
    isSelected: boolean
    testIdPrefix: string
    onSelect(key: string): void
}

function Tab({ tabKey, label, isSelected, testIdPrefix, onSelect }: TabProps) {
    const look = isSelected ? 'selected' : 'idle'
    const press = () => onSelect(tabKey)
    return (
        <Pressable
            testID={`${testIdPrefix}-tab-${tabKey}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            aria-selected={isSelected}
            onPress={press}
            className={TAB_CLASS[look]}
            style={TAB_TAP}
        >
            <Text className={TAB_LABEL_CLASS[look]}>{label}</Text>
        </Pressable>
    )
}

// A strip of tabs under a list's title. It scrolls sideways when the tabs do not fit, and
// its bottom rule spans the screen.
export function ListTabs({ tabs, selected, testIdPrefix, onSelect }: ListTabsProps) {
    const items = tabs.map(tab => (
        <Tab
            key={tab.key}
            tabKey={tab.key}
            label={tab.label}
            isSelected={tab.key === selected}
            testIdPrefix={testIdPrefix}
            onSelect={onSelect}
        />
    ))
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            accessibilityRole="tablist"
            contentContainerClassName="flex-row gap-6 border-b border-border px-4"
            contentContainerStyle={TAB_STRIP_CONTENT}
        >
            {items}
        </ScrollView>
    )
}
