import { TextAreaInput } from '@tinycld/core/ui/form'
import { Platform, ScrollView, View } from 'react-native'
import type { CustomerPageState } from '../../../hooks/useCustomerPage'

interface CustomerNotesTabProps {
    notes: CustomerPageState['notes']
    readOnly: boolean
    rowClassName: string
}

const NOTES_LINES = 10

/**
 * The one place a customer's notes are edited. A writer's field takes the focus when the
 * tab opens (web; a phone would raise its keyboard over the page); a reader's is not
 * editable.
 */
export function CustomerNotesTab({ notes, readOnly, rowClassName }: CustomerNotesTabProps) {
    const autoFocus = Platform.OS === 'web' && !readOnly
    return (
        <ScrollView testID="customer-notes" className="flex-1">
            <View className={`pt-4 ${rowClassName}`}>
                <TextAreaInput
                    name="notes"
                    control={notes.form.control}
                    label="Notes"
                    hint="Only people with access to Books see these notes."
                    numberOfLines={NOTES_LINES}
                    editable={!readOnly}
                    autoFocus={autoFocus}
                    testID="customer-notes-input"
                />
            </View>
        </ScrollView>
    )
}
