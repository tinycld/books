import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ScrollView, Text, View } from 'react-native'
import { useBackToReports } from '../../hooks/useBackToReports'
import {
    type ReportPrerequisites,
    type ReportScreenModel,
    useReportPrerequisites,
    useReportScreen,
} from '../../hooks/useReportScreen'
import type { ReportDefinition, ReportOptions } from '../../lib/report-definition'
import type { PeriodContext } from '../../lib/report-period'
import type { ControlRowItem, EmptyAction } from '../../lib/report-state'
import { ReportDocumentHeader } from './ReportDocumentHeader'
import { ReportEmptyState } from './ReportEmptyState'
import { REPORT_TAP_TARGET, ReportHeader } from './ReportHeader'
import { ReportMethodToggle } from './ReportMethodToggle'
import { ReportNotFound } from './ReportNotFound'
import { ReportPeriodControl } from './ReportPeriodControl'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="report-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function ErrorBody({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="report-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-base font-medium text-foreground">
                Could not load this report
            </Text>
            <Button
                testID="report-retry"
                variant="outline"
                style={{ minHeight: REPORT_TAP_TARGET }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface EmptyBodyProps {
    isVisible: boolean
    message: string
    action: EmptyAction | null
    onAction: () => void
}

function EmptyBody({ isVisible, message, action, onAction }: EmptyBodyProps) {
    if (!isVisible) return null
    return <ReportEmptyState message={message} action={action} onAction={onAction} />
}

// The filter chips arrive with their own controls in a later checkpoint.
function ControlItem({ item, model }: { item: ControlRowItem; model: ReportScreenModel }) {
    const { form } = model
    const onPeriodOpenChange = (open: boolean) => {
        if (open) model.onOpenSurface({ kind: 'period' })
        else model.onCloseSurface()
    }
    if (item.kind === 'period') {
        return (
            <ReportPeriodControl
                label={model.periodChipLabel}
                period={model.definition.period}
                form={form}
                isOpen={model.surface?.kind === 'period'}
                onOpenChange={onPeriodOpenChange}
            />
        )
    }
    if (item.kind === 'method') {
        return <ReportMethodToggle control={form.control} onValueChange={form.onOptionChange} />
    }
    return null
}

function controlKey(item: ControlRowItem): string {
    return item.kind === 'filter' ? `filter-${item.filter.id}` : item.kind
}

function basisLabel(definition: ReportDefinition, options: ReportOptions): string | null {
    if (!definition.hasBasis) return null
    return options.basis === 'cash' ? 'Cash basis' : 'Accrual basis'
}

export function ReportScreenView({ model }: { model: ReportScreenModel }) {
    const { definition, options, state } = model
    const controls = model.controlItems.map(item => (
        <ControlItem key={controlKey(item)} item={item} model={model} />
    ))
    const basis = basisLabel(definition, options)
    return (
        <View testID="report-screen" className="flex-1 flex-row bg-background">
            <View className="min-w-0 flex-1">
                <ReportHeader title={definition.title} onBack={model.onBack} toolbar={null} />
                <ScrollView
                    horizontal
                    testID="report-controls"
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0, flexShrink: 0 }}
                    contentContainerClassName="flex-row items-center gap-2 px-4 py-2"
                >
                    {controls}
                </ScrollView>
                <ReportDocumentHeader
                    businessName={model.businessName}
                    title={definition.title}
                    periodWords={model.periodWords}
                    basisLabel={basis}
                    isThousands={options.numberFormat.divideBy1000}
                />
                <LoadingBody isVisible={state === 'loading'} />
                <ErrorBody isVisible={state === 'error'} onRetry={model.onRetry} />
                <EmptyBody
                    isVisible={state === 'empty'}
                    message={model.emptyMessage}
                    action={model.emptyAction}
                    onAction={model.onEmptyAction}
                />
            </View>
        </View>
    )
}

interface ReportScreenBodyProps {
    definition: ReportDefinition
    context: PeriodContext
    prerequisites: ReportPrerequisites
}

function ReportScreenBody({ definition, context, prerequisites }: ReportScreenBodyProps) {
    const model = useReportScreen({ definition, context, prerequisites })
    return <ReportScreenView model={model} />
}

interface PrerequisitesFrameProps {
    title: string
    state: ReportPrerequisites['state']
    onRetry: () => void
}

// Books access and settings are still loading or failed: the header stays, the figures wait.
function PrerequisitesFrame({ title, state, onRetry }: PrerequisitesFrameProps) {
    const onBack = useBackToReports()
    return (
        <View testID="report-screen" className="flex-1 bg-background">
            <ReportHeader title={title} onBack={onBack} toolbar={null} />
            <LoadingBody isVisible={state === 'loading'} />
            <ErrorBody isVisible={state === 'error'} onRetry={onRetry} />
        </View>
    )
}

export function ReportScreen({ definition }: { definition: ReportDefinition }) {
    const prerequisites = useReportPrerequisites()
    const { state, context } = prerequisites
    if (state === 'no-access') return <ReportNotFound />
    if (!context) {
        return (
            <PrerequisitesFrame
                title={definition.title}
                state={state}
                onRetry={prerequisites.onRetry}
            />
        )
    }
    return (
        <ReportScreenBody definition={definition} context={context} prerequisites={prerequisites} />
    )
}
