import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Href, router } from 'expo-router'

interface ShippedReportButtonProps {
    href: Href | null
    label: string
    testID: string
}

// Navigation only, so it shows for every reader and needs no write access.
export function ShippedReportButton({ href, label, testID }: ShippedReportButtonProps) {
    if (href === null) return null
    const open = () => router.push(href)
    return (
        <Button
            testID={testID}
            variant="outline"
            size="sm"
            style={{ minHeight: 36 }}
            onPress={open}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}
