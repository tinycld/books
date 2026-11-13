import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface Props {
    isVisible: boolean
    text: string
    actionLabel: string
    // The notice's test id; its action's is `<testID>-reload`.
    testID: string
    // Absent on a form that cannot load the record in place: the notice has no button.
    onReload?: () => void
}

const ACTION_STYLE = { minHeight: 44 }

function ReloadButton({ actionLabel, testID, onReload }: Omit<Props, 'isVisible' | 'text'>) {
    if (!onReload) return null
    return (
        <Button
            testID={`${testID}-reload`}
            variant="outline"
            size="sm"
            className="self-start"
            style={ACTION_STYLE}
            onPress={onReload}
        >
            <ButtonText>{actionLabel}</ButtonText>
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
