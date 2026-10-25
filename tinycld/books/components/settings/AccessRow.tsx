import { Avatar } from '@tinycld/core/components/Avatar'
import { SelectInput } from '@tinycld/core/ui/form'
import { useForm } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { AccessPerson } from '../../hooks/useAccessList'
import { useAccessMutation } from '../../hooks/useAccessMutation'
import type { BooksLevel } from '../../lib/access'
import {
    ACCESS_LEVELS,
    accessRowControl,
    asBooksLevel,
    levelDescription,
    levelLabel,
    type OrgRole,
} from '../../lib/access-levels'

interface AccessRowProps {
    person: AccessPerson
    viewerOrgRole: OrgRole
    viewerId: string
}

function LevelChip({ level, userId }: { level: BooksLevel; userId: string }) {
    return (
        <View
            className="rounded-full border border-border bg-accent px-2 py-0.5"
            testID={`books-settings-access-chip-${userId}`}
        >
            <Text className="text-xs font-medium text-accent-foreground">{levelLabel(level)}</Text>
        </View>
    )
}

function LevelSelect({
    person,
    shownLevel,
    options,
    isDisabled,
    onChoose,
}: {
    person: AccessPerson
    shownLevel: BooksLevel
    options: BooksLevel[]
    isDisabled: boolean
    onChoose: (level: BooksLevel) => void
}) {
    // The live shown level feeds the form, so a refused write puts the old level back.
    const { control } = useForm({ values: { level: shownLevel } })
    const choose = (value: string) => {
        const level = asBooksLevel(value)
        if (level) onChoose(level)
    }
    // A disabled select still names the chosen level, so it lists every level.
    const listed = isDisabled ? ACCESS_LEVELS.map(l => l.value) : options
    const choices = ACCESS_LEVELS.filter(l => listed.includes(l.value)).map(l => ({
        value: l.value,
        label: l.label,
    }))
    return (
        <View className="w-44">
            <SelectInput
                control={control}
                name="level"
                label={`Access level for ${person.name}`}
                hideLabel
                options={choices}
                disabled={isDisabled}
                onValueChange={choose}
                testID={`books-settings-access-level-${person.id}`}
            />
        </View>
    )
}

function RowError({ message, isVisible }: { message: string | null; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text accessibilityRole="alert" className="text-xs text-danger">
            {message}
        </Text>
    )
}

function ReadError({ userId, isVisible }: { userId: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text
            accessibilityRole="alert"
            className="text-xs text-danger"
            testID={`books-settings-access-read-error-${userId}`}
        >
            Access could not be loaded for this person. Reload the section to try again.
        </Text>
    )
}

export function AccessRow({ person, viewerOrgRole, viewerId }: AccessRowProps) {
    const { setLevel, shownLevel, error, isReady, isPending, readFailed } =
        useAccessMutation(person)
    const control = accessRowControl({
        viewerOrgRole,
        viewerIsSelf: person.id === viewerId,
        targetOrgRole: person.orgRole,
        level: person.level,
    })
    const isLocked = control.lockedText !== null
    const note = control.lockedText ?? control.disabledText ?? levelDescription(shownLevel)
    return (
        <View
            className="flex-row flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3"
            testID={`books-settings-access-row-${person.id}`}
        >
            <View className="min-w-[240px] flex-1 flex-row items-start gap-3">
                <Avatar name={person.name} email={person.email} colorKey={person.id} size={36} />
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                        {person.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                        {person.email}
                    </Text>
                    <Text
                        className="text-xs text-muted-foreground"
                        testID={`books-settings-access-note-${person.id}`}
                    >
                        {note}
                    </Text>
                    <RowError message={error} isVisible={error !== null} />
                    <ReadError userId={person.id} isVisible={readFailed} />
                </View>
            </View>
            <View className="flex-row items-center gap-2 pl-12 sm:pl-0">
                <SelectSlot
                    isVisible={!isLocked}
                    person={person}
                    shownLevel={shownLevel}
                    options={control.options}
                    isDisabled={control.disabledText !== null || !isReady || isPending}
                    onChoose={setLevel}
                />
                <LevelChip level={shownLevel} userId={person.id} />
            </View>
        </View>
    )
}

function SelectSlot({
    isVisible,
    ...props
}: {
    isVisible: boolean
    person: AccessPerson
    shownLevel: BooksLevel
    options: BooksLevel[]
    isDisabled: boolean
    onChoose: (level: BooksLevel) => void
}) {
    if (!isVisible) return null
    return <LevelSelect {...props} />
}
