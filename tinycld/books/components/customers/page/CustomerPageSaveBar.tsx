import { FormErrorSummary } from '@tinycld/core/ui/form'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'
import { rootErrorOnly } from '../../../lib/root-errors'

// The surface's `modal` scope (the top one on the page); Escape here is the only Escape
// while the bar shows, because the surface registers its own only while nothing is dirty.
const CANCEL_KEY = { keys: 'Escape', scope: 'modal', allowInInputs: true } as const
const SAVE_KEY = { keys: '$mod+s', scope: 'modal', allowInInputs: true } as const

interface CustomerPageSaveBarProps {
    isVisible: boolean
    isSaving: boolean
    onSave: () => void
    onCancel: () => void
    // A refusal with no field the user can see on the current tab.
    rootError: string | null
    gutterClass: string
}

/**
 * At the bottom of the page on every tab while Details or Notes has unsaved edits:
 * "Unsaved changes", Cancel (Esc) and Save (⌘S). Mounted only while it shows, so its keys
 * are registered only then.
 */
export function CustomerPageSaveBar({
    isVisible,
    isSaving,
    onSave,
    onCancel,
    rootError,
    gutterClass,
}: CustomerPageSaveBarProps) {
    if (!isVisible) return null
    const errors = rootErrorOnly({ root: { message: rootError ?? undefined } })
    return (
        <View
            testID="customer-save-bar"
            className={`border-t border-border bg-background py-3 ${gutterClass}`}
        >
            <FormErrorSummary
                testID="customer-save-error-summary"
                errors={errors}
                showFieldNames={false}
                isEnabled={rootError !== null}
            />
            <View className="flex-row items-center justify-end gap-2">
                <Text className="flex-1 text-sm text-muted-foreground">Unsaved changes</Text>
                <ShortcutButton
                    testID="customer-cancel"
                    label="Cancel"
                    variant="outline"
                    shortcut={CANCEL_KEY}
                    isDisabled={isSaving}
                    onPress={onCancel}
                />
                <ShortcutButton
                    testID="customer-save"
                    label="Save"
                    shortcut={SAVE_KEY}
                    isDisabled={isSaving}
                    onPress={onSave}
                    serverAction
                />
            </View>
        </View>
    )
}
