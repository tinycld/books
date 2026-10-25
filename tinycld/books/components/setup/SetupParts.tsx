import { SetupContinueButton } from '@tinycld/core/components/setup/wizard/SetupContinueButton'
import { StepHeading } from '@tinycld/core/components/setup/wizard/StepHeading'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { FormErrorSummary, SelectInput, TextInput } from '@tinycld/core/ui/form'
import type { ComponentType } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SETTINGS_LABEL } from '../../hooks/useBooksSetup'
import { useSetupParts } from '../../hooks/useSetupParts'
import { accountCountLabel, chartCountNote } from '../../lib/setup-copy'
import { FISCAL_MONTHS } from '../../lib/setup-schema'
import { OWNERSHIP_CHOICES } from '../../lib/starter-chart'

type Parts = ReturnType<typeof useSetupParts>

const MONTH_OPTIONS = FISCAL_MONTHS.map((label, index) => ({ label, value: String(index + 1) }))

function useRowOnWide(): string {
    return useBreakpoint() === 'mobile' ? 'flex-col gap-3' : 'flex-row gap-3'
}

function PartLabel({ label }: { label: string }) {
    if (!label) return null
    return (
        <Text
            testID="books-setup-part-label"
            className="mb-2 text-[13px] font-semibold text-muted-foreground"
        >
            {label}
        </Text>
    )
}

function ContinueSlot({ action }: { action: Parts['continueAction'] }) {
    if (!action) return null
    return (
        <SetupContinueButton
            label={action.label}
            onPress={action.onPress}
            isDisabled={action.isDisabled}
            requiresServer={action.requiresServer}
        />
    )
}

function BackButton({ onPress, isVisible }: { onPress: () => void; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="flex-row">
            <Button
                variant="outline"
                size="lg"
                accessibilityLabel="Back"
                testID="books-setup-back"
                onPress={onPress}
            >
                <ButtonText>Back</ButtonText>
            </Button>
        </View>
    )
}

function Heading({ parts, title, lead }: { parts: Parts; title: string; lead: string }) {
    return (
        <View>
            <PartLabel label={parts.positionLabel} />
            <StepHeading title={title} lead={lead} />
        </View>
    )
}

function BusinessPart({ parts }: { parts: Parts }) {
    const { form, goNext } = parts
    return (
        <View>
            <Heading
                parts={parts}
                title="What do you call your business?"
                lead="Shown on invoices and reports."
            />
            <TextInput
                control={form.control}
                name="business_name"
                label="Legal business name"
                testID="books-setup-business-name"
                returnKeyType="next"
                onSubmitEditing={goNext}
            />
            <SelectInput
                control={form.control}
                name="fiscal_year_start_month"
                label="Fiscal year starts in"
                options={MONTH_OPTIONS}
                testID="books-setup-month"
            />
            <Text className="text-sm text-muted-foreground">Currency: US dollars (USD)</Text>
            <FormErrorSummary errors={parts.errors} />
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

interface ChoiceCardProps {
    value: string
    label: string
    description: string
    isSelected: boolean
    onSelect: () => void
}

function ChoiceCard({ value, label, description, isSelected, onSelect }: ChoiceCardProps) {
    const frame = isSelected ? 'border-primary bg-surface-secondary' : 'border-border bg-background'
    return (
        <Pressable
            testID={`books-setup-ownership-${value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            onPress={onSelect}
            className={`min-h-11 flex-1 gap-1 rounded-xl border-2 p-4 ${frame}`}
        >
            <Text className="text-base font-semibold text-foreground">{label}</Text>
            <Text className="text-sm text-muted-foreground">{description}</Text>
        </Pressable>
    )
}

function OwnershipPart({ parts }: { parts: Parts }) {
    const direction = useRowOnWide()
    const cards = OWNERSHIP_CHOICES.map(choice => (
        <ChoiceCard
            key={choice.value}
            value={choice.value}
            label={choice.title}
            description={choice.summary}
            isSelected={choice.value === parts.ownership}
            onSelect={() => parts.selectOwnership(choice.value)}
        />
    ))
    return (
        <View className="gap-6">
            <Heading
                parts={parts}
                title="How is the business owned?"
                lead="This only decides your equity accounts. Everything else is the same."
            />
            <View className={direction} accessibilityRole="radiogroup">
                {cards}
            </View>
            <BackButton onPress={parts.goBack} isVisible={parts.canGoBack} />
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

function ChartGroup({ group }: { group: Parts['groups'][number] }) {
    const lines = group.accounts.map(account => (
        <Text key={account.key} className="py-1.5 text-sm text-foreground" numberOfLines={1}>
            {account.number} {account.name}
        </Text>
    ))
    return (
        <View>
            <View className="border-b border-border pb-1.5">
                <Text className="text-sm font-semibold text-foreground">{group.label}</Text>
            </View>
            {lines}
        </View>
    )
}

function ChartPreview({ groups }: { groups: Parts['groups'] }) {
    const sections = groups.map(group => <ChartGroup key={group.key} group={group} />)
    return (
        <View
            testID="books-setup-chart-preview"
            className="gap-5 rounded-xl border border-border px-4 py-3"
        >
            {sections}
        </View>
    )
}

function SkipButton({ onPress, isVisible }: { onPress: () => void; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Button
            variant="link"
            size="sm"
            className="px-0"
            testID="books-setup-skip-chart"
            onPress={onPress}
        >
            <ButtonText className="text-muted-foreground">Start with an empty chart</ButtonText>
        </Button>
    )
}

function ChartPart({ parts }: { parts: Parts }) {
    return (
        <View className="gap-6">
            <View>
                <Heading
                    parts={parts}
                    title="Your starter chart"
                    lead={`${accountCountLabel(parts.chartCount)}. You can change any of them later.`}
                />
                <ChartPreview groups={parts.groups} />
            </View>
            <View className="flex-row items-center justify-between">
                <BackButton onPress={parts.goBack} isVisible={parts.canGoBack} />
                <SkipButton onPress={parts.skipChart} isVisible={parts.canSkip} />
            </View>
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
    const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0
    return (
        <View className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
            <View className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </View>
    )
}

function CreatingPart({ parts }: { parts: Parts }) {
    const done = parts.progress?.done ?? 0
    const total = parts.progress?.total ?? parts.chartCount
    return (
        <View className="gap-5" testID="books-setup-creating">
            <Heading
                parts={parts}
                title="Creating your books"
                lead="Keep this page open until it finishes."
            />
            <ProgressBar done={done} total={total} />
            <Text className="text-sm text-muted-foreground">
                Creating accounts {done} of {total}
            </Text>
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

function failureHeading(failure: Parts['failure']): string {
    if (failure?.failedAccount === SETTINGS_LABEL) return 'Your settings could not be saved'
    return `${failure?.failedAccount} was refused`
}

function ChartCountNote({ created }: { created: number }) {
    const note = chartCountNote(created)
    if (!note) return null
    return <Text className="text-sm text-muted-foreground">{note}</Text>
}

function ErrorPart({ parts }: { parts: Parts }) {
    const created = parts.accountCount ?? 0
    return (
        <View className="gap-5" testID="books-setup-error">
            <Heading parts={parts} title="Creating your books" lead="" />
            <ProgressBar done={created} total={parts.chartCount} />
            <View
                accessibilityRole="alert"
                className="gap-1 rounded-xl border border-danger bg-background p-4"
            >
                <Text className="text-sm font-semibold text-danger">
                    {failureHeading(parts.failure)}
                </Text>
                <Text className="text-sm text-foreground">{parts.failure?.message}</Text>
                <ChartCountNote created={created} />
            </View>
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

function PopulatedPart({ parts }: { parts: Parts }) {
    return (
        <View className="gap-6" testID="books-setup-populated">
            <Heading
                parts={parts}
                title="Your starter chart"
                lead={`This book already has ${accountCountLabel(parts.accountCount ?? 0)}. We will not add the starter chart.`}
            />
            <BackButton onPress={parts.goBack} isVisible={parts.canGoBack} />
            <ContinueSlot action={parts.continueAction} />
        </View>
    )
}

function OpeningBalancesButton({ parts }: { parts: Parts }) {
    if (!parts.hasOpeningBalances) return null
    return (
        <Button
            size="lg"
            variant="outline"
            testID="books-setup-open-opening-balances"
            onPress={parts.openOpeningBalances}
        >
            <ButtonText>Enter opening balances</ButtonText>
        </Button>
    )
}

function DonePart({ parts }: { parts: Parts }) {
    const direction = useRowOnWide()
    return (
        <View className="gap-6" testID="books-setup-done">
            <StepHeading
                title="Your books are ready"
                lead={`${parts.businessName} has ${accountCountLabel(parts.accountCount ?? 0)}.`}
            />
            <View className={direction}>
                <Button size="lg" testID="books-setup-open-chart" onPress={parts.openChart}>
                    <ButtonText>Open Chart of Accounts</ButtonText>
                </Button>
                <OpeningBalancesButton parts={parts} />
            </View>
        </View>
    )
}

export const NON_ADMIN_MESSAGE = 'A Books admin must finish setting up Books.'

// The route shows this alone, without the wizard card, to someone who cannot
// finish setup.
export function NonAdminView({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View
            testID="books-setup-non-admin"
            className="flex-1 items-center justify-center bg-surface-secondary px-6 py-10"
        >
            <View className="w-full max-w-[640px] gap-2 rounded-2xl border border-border bg-background p-10 shadow-lg">
                <Text className="text-xl font-semibold text-foreground">Books setup</Text>
                <Text className="text-[15px] leading-6 text-muted-foreground">
                    {NON_ADMIN_MESSAGE}
                </Text>
            </View>
        </View>
    )
}

function NonAdminPart({ parts }: { parts: Parts }) {
    return <NonAdminView isVisible={parts.part === 'non-admin'} />
}

function RetryLoad({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View className="items-start gap-3" testID="books-setup-load-error">
            <Text className="text-sm text-danger">Books setup could not load.</Text>
            <Button variant="outline" testID="books-setup-retry-load" onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function LoadingPart({ parts }: { parts: Parts }) {
    return (
        <View className="gap-5" testID="books-setup-loading">
            <View className="h-8 w-3/4 rounded-lg bg-surface-secondary" />
            <View className="h-4 w-1/2 rounded-lg bg-surface-secondary" />
            <View className="h-11 rounded-lg bg-surface-secondary" />
            <View className="h-11 rounded-lg bg-surface-secondary" />
            <RetryLoad isVisible={parts.hasLoadError} onRetry={parts.retryLoad} />
        </View>
    )
}

const PART_VIEWS: Record<Parts['part'], ComponentType<{ parts: Parts }>> = {
    business: BusinessPart,
    ownership: OwnershipPart,
    chart: ChartPart,
    creating: CreatingPart,
    done: DonePart,
    error: ErrorPart,
    populated: PopulatedPart,
    'non-admin': NonAdminPart,
    loading: LoadingPart,
}

export function SetupParts({ next }: { next?: () => void }) {
    const parts = useSetupParts(next)
    const PartView = PART_VIEWS[parts.part]
    return <PartView parts={parts} />
}
