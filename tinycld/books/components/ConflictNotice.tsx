import { useMutation } from '@tinycld/core/lib/mutations'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface Props {
    isVisible: boolean
    text: string
    actionLabel: string
    // The notice's test id; its action's is `<testID>-reload`.
    testID: string
    // Absent on a form that cannot load the record in place: the notice has no button.
    // It settles when the record was read, or when the form says the read failed.
    onReload?: () => void | Promise<void>
}

const ACTION_STYLE = { minHeight: 44 }

// A read that gets no answer is tried again until it gets one, so the load can take a
// long time: the button says so and takes no second press until it settles.
function ReloadButton({ actionLabel, testID, onReload }: Omit<Props, 'isVisible' | 'text'>) {
    const reload = useMutation({ mutationFn: async () => onReload?.() })
    if (!onReload) return null
    const label = reload.isPending ? 'Loading…' : actionLabel
    return (
        <Button
            testID={`${testID}-reload`}
            variant="outline"
            size="sm"
            className="self-start"
            style={ACTION_STYLE}
            isDisabled={reload.isPending}
            onPress={() => reload.mutate()}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

// Shown when a save or a post was refused because another session changed the record.
// Loading the current record replaces what is typed here, so it is the person's choice.
export function ConflictNotice({ isVisible, text, actionLabel, testID, onReload }: Props) {
    if (!isVisible) return null
    return (
        <View
            testID={testID}
            accessibilityRole="alert"
            className="gap-2 rounded-md border border-border bg-muted p-3"
        >
            <Text className="text-sm text-foreground">{text}</Text>
            <ReloadButton actionLabel={actionLabel} testID={testID} onReload={onReload} />
        </View>
    )
}
