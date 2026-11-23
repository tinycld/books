import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Check, SlidersHorizontal } from 'lucide-react-native'
import { DashboardIconButton } from './DashboardIconButton'

interface CustomizeButtonProps {
    isEditing: boolean
    // Customize is not offered until the preference has loaded (spec §3 "What is saved").
    isDisabled: boolean
    onPress: () => void
}

// The header's Customize button, "Done" in edit mode. Below the mobile breakpoint it is an
// icon button that keeps the word as its accessible name (spec §3 "States", Phone).
export function CustomizeButton({ isEditing, isDisabled, onPress }: CustomizeButtonProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const label = isEditing ? 'Done' : 'Customize'
    const icon = isEditing ? Check : SlidersHorizontal
    const variant = isEditing ? 'default' : 'outline'

    if (isPhone) {
        return (
            <DashboardIconButton
                testID="dashboard-customize"
                label={label}
                icon={icon}
                iconSize={18}
                isDisabled={isDisabled}
                onPress={onPress}
            />
        )
    }
    return (
        <Button
            testID="dashboard-customize"
            variant={variant}
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}
