import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { useForm1099Section } from '../../hooks/useForm1099Section'
import type { BooksSettings } from '../../types'
import { AccountBoxesCard } from './AccountBoxesCard'
import { ThresholdCard } from './ThresholdCard'
import { Tracked1099VendorsCard } from './Tracked1099VendorsCard'

function SectionLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="books-1099-loading">
            <LoadingState />
        </View>
    )
}

function SectionError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
            testID="books-1099-error"
        >
            <Text className="text-sm text-foreground">1099 settings could not be loaded.</Text>
            <Button size="sm" variant="outline" testID="books-1099-retry" onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface SectionReadyProps {
    isVisible: boolean
    settings: BooksSettings | undefined
    accounts: ComponentProps<typeof AccountBoxesCard>['accounts']
    controls: ComponentProps<typeof AccountBoxesCard>['controls']
    vendors: ComponentProps<typeof Tracked1099VendorsCard>['vendors']
    onOpenVendor(id: string): void
    onOpenVendors(): void
}

function SectionReady({
    isVisible,
    settings,
    accounts,
    controls,
    vendors,
    onOpenVendor,
    onOpenVendors,
}: SectionReadyProps) {
    if (!isVisible || !settings) return null
    return (
        <View className="gap-4" testID="books-1099-section">
            <ThresholdCard settings={settings} editsThreshold={controls.editsThreshold} />
            <AccountBoxesCard accounts={accounts} controls={controls} />
            <Tracked1099VendorsCard
                vendors={vendors}
                onOpen={onOpenVendor}
                onOpenVendors={onOpenVendors}
            />
        </View>
    )
}

// It takes no isAdmin from SectionBody: the threshold is admin-only but the boxes are for
// every writer, so the section reads the full access level through useForm1099Section.
export function Form1099Section() {
    const section = useForm1099Section()
    return (
        <>
            <SectionLoading isVisible={section.part === 'loading'} />
            <SectionError isVisible={section.part === 'error'} onRetry={section.retry} />
            <SectionReady
                isVisible={section.part === 'ready'}
                settings={section.settings}
                accounts={section.accounts}
                controls={section.controls}
                vendors={section.vendors}
                onOpenVendor={section.openVendor}
                onOpenVendors={section.openVendors}
            />
        </>
    )
}
