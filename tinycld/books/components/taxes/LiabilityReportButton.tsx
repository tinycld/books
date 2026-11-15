import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Href, router } from 'expo-router'

interface LiabilityReportButtonProps {
    href: Href | null
}

// Navigation only, so it shows for every reader and needs no write access.
export function LiabilityReportButton({ href }: LiabilityReportButtonProps) {
    if (href === null) return null
    const open = () => router.push(href)
    return (
        <Button
            testID="taxes-liability-report"
            variant="outline"
            size="sm"
            style={{ minHeight: 36 }}
            onPress={open}
        >
            <ButtonText>Liability report</ButtonText>
        </Button>
    )
}
