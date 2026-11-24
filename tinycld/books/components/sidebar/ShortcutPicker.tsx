import { Text, View } from 'react-native'
import { useShortcutChoices } from '../../hooks/useShortcutChoices'
import { MAX_SHORTCUTS, type Shortcut } from '../../lib/sidebar-shortcuts'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

interface ShortcutPickerProps {
    // The dialog's draft: a shortcut in it is not offered again.
    list: readonly Shortcut[]
    onAdd: (shortcut: Shortcut) => void
}

function FullNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-full" className="text-sm text-muted-foreground">
            {`The list holds ${MAX_SHORTCUTS} shortcuts, the most it can. Remove one to add another.`}
        </Text>
    )
}

// "Add shortcut" of the Customize shortcuts dialog: one searchable list of the screens,
// forms, Books reports and account registers that are not in the list yet.
export function ShortcutPicker({ list, onAdd }: ShortcutPickerProps) {
    const picker = useSearchPicker()
    const { choices, isFull, isLoading, isError, retry } = useShortcutChoices(
        list,
        picker.debouncedTerm
    )
    const onChange = (id: string) => {
        const picked = choices.find(candidate => candidate.id === id)
        if (picked) onAdd(picked.shortcut)
    }
    return (
        <View className="gap-2">
            <SearchPicker
                picker={picker}
                title="Add shortcut"
                triggerLabel="Add shortcut"
                triggerAccessibilityLabel="Add shortcut"
                triggerTestId="books-shortcuts-add"
                isPlaceholder
                disabled={isFull}
                searchPlaceholder="Search screens, forms, reports and accounts"
                searchTestId="books-shortcuts-add-search"
                options={choices}
                optionTestIdPrefix="books-shortcuts-add-option"
                value=""
                onChange={onChange}
                isLoading={isLoading}
                loadFailed={isError}
                onRetry={retry}
                emptyText="Nothing more to add"
            />
            <FullNote isVisible={isFull} />
        </View>
    )
}
