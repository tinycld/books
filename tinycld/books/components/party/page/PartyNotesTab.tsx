import { TextAreaInput } from '@tinycld/core/ui/form'
import { Platform, ScrollView, View } from 'react-native'
import type { PartyPageState } from '../../../hooks/usePartyPage'

interface PartyNotesTabProps {
    notes: PartyPageState['notes']
    readOnly: boolean
    rowClassName: string
    testIdPrefix: string
}

const NOTES_LINES = 10

/**
 * The one place a party's notes are edited. A writer's field takes the focus when the
 * tab opens (web; a phone would raise its keyboard over the page); a reader's is not
 * editable.
 */
export function PartyNotesTab({ notes, readOnly, rowClassName, testIdPrefix }: PartyNotesTabProps) {
    const autoFocus = Platform.OS === 'web' && !readOnly
    return (
        <ScrollView testID={`${testIdPrefix}-notes`} className="flex-1">
            <View className={`pt-4 ${rowClassName}`}>
                <TextAreaInput
                    name="notes"
                    control={notes.form.control}
                    label="Notes"
                    hint="Only people with access to Books see these notes."
                    numberOfLines={NOTES_LINES}
                    editable={!readOnly}
                    autoFocus={autoFocus}
                    testID={`${testIdPrefix}-notes-input`}
                />
            </View>
        </ScrollView>
    )
}
