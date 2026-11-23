import { SidebarHeading } from '@tinycld/core/components/sidebar-primitives'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Pressable } from 'react-native'

interface FoldHeadingProps {
    title: string
    isOpen: boolean
    onToggle: () => void
    // The test id of the fold button.
    testID: string
}

// A sidebar heading with a button that folds the rows under it. The button's name says
// what a press does ("Expand New", "Collapse New"), so a screen reader and a test both
// read the state from it.
export function FoldHeading({ title, isOpen, onToggle, testID }: FoldHeadingProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const Chevron = isOpen ? ChevronDown : ChevronRight
    const label = isOpen ? `Collapse ${title}` : `Expand ${title}`

    return (
        <SidebarHeading
            action={
                <Pressable
                    testID={testID}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ expanded: isOpen }}
                    onPress={onToggle}
                    hitSlop={8}
                    className="items-center justify-center"
                    style={{ minWidth: 44, minHeight: 44 }}
                >
                    <Chevron size={16} color={mutedColor} />
                </Pressable>
            }
        >
            {title}
        </SidebarHeading>
    )
}
