import { Button, ButtonText } from '@tinycld/core/ui/button'
import { MoreHorizontal } from 'lucide-react-native'
import { Pressable } from 'react-native'

/**
 * The trigger of a party page's More menu (`<prefix>-more`): an icon button on a phone,
 * where the header's top right has room for one icon only. An element, not a component:
 * the menu clones it with its press handler and anchor ref.
 */
export function moreTrigger(isPhone: boolean, color: string, testIdPrefix: string) {
    const testID = `${testIdPrefix}-more`
    if (isPhone) {
        return (
            <Pressable
                testID={testID}
                accessibilityRole="button"
                accessibilityLabel="More"
                className="h-11 w-11 items-center justify-center"
            >
                <MoreHorizontal size={20} color={color} />
            </Pressable>
        )
    }
    return (
        <Button testID={testID} variant="outline" style={{ minHeight: 44 }}>
            <ButtonText>More</ButtonText>
        </Button>
    )
}
