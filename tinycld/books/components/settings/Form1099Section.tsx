import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Href, router } from 'expo-router'
import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { useForm1099Section } from '../../hooks/useForm1099Section'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import { FORM_1099_SHIPPED_KEY } from '../../lib/shipped-reports'
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

// Navigation only, so every Books reader sees it, as the Vendors list's Reports menu.
function OpenReportButton({ isVisible, href }: { isVisible: boolean; href: Href | null }) {
    if (!isVisible || href === null) return null
    const open = () => router.push(href)
    return (
        <View className="items-start">
            <Button size="sm" variant="outline" testID="books-1099-open-report" onPress={open}>
                <ButtonText>Open the 1099 report</ButtonText>
            </Button>
        </View>
    )
}

interface SectionReadyProps {
    isVisible: boolean
    // Null while the report loads, when its read fails and when the reader has none:
    // then the section draws no button.
    reportHref: Href | null
    settings: BooksSettings
    accounts: ComponentProps<typeof AccountBoxesCard>['accounts']
    controls: ComponentProps<typeof AccountBoxesCard>['controls']
    vendors: ComponentProps<typeof Tracked1099VendorsCard>['vendors']
    onOpenVendor(id: string): void
    onOpenVendors(): void
}

function SectionReady({
    isVisible,
    reportHref,
    settings,
    accounts,
    controls,
    vendors,
    onOpenVendor,
    onOpenVendors,
}: SectionReadyProps) {
    if (!isVisible) return null
    return (
        <View className="gap-4" testID="books-1099-section">
            <OpenReportButton isVisible={reportHref !== null} href={reportHref} />
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

// It takes the settings row from the panel but not isAdmin: the threshold is admin-only but
// the boxes are for every writer, so the section reads the full access level through
// useForm1099Section.
export function Form1099Section({ settings }: { settings: BooksSettings }) {
    const section = useForm1099Section()
    const reportHref = useShippedReportHref(FORM_1099_SHIPPED_KEY)
    return (
        <>
            <SectionLoading isVisible={section.part === 'loading'} />
            <SectionError isVisible={section.part === 'error'} onRetry={section.retry} />
            <SectionReady
                isVisible={section.part === 'ready'}
                reportHref={reportHref}
                settings={settings}
                accounts={section.accounts}
                controls={section.controls}
                vendors={section.vendors}
                onOpenVendor={section.openVendor}
                onOpenVendors={section.openVendors}
            />
        </>
    )
}
