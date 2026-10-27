import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import {
    Drawer,
    DrawerBackdrop,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerHeader,
} from '@tinycld/core/ui/drawer'
import { ButtonGroup, SelectInput, Toggle } from '@tinycld/core/ui/form'
import { Sheet } from '@tinycld/core/ui/sheet'
import { ChevronDown, ChevronRight, X } from 'lucide-react-native'
import { type ReactNode, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ReportScreenModel } from '../../hooks/useReportScreen'
import type { CustomizeSection } from '../../lib/report-state'
import { REPORT_TAP_TARGET } from './ReportHeader'

const SECTION_TITLES: Record<CustomizeSection, string> = {
    'number-format': 'Number format',
    rows: 'Rows',
    columns: 'Columns',
}

const NEGATIVE_OPTIONS = [
    { value: 'minus', label: '-100' },
    { value: 'parens', label: '(100)' },
]

const ROWS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'non-zero', label: 'Non-zero' },
    { value: 'all', label: 'All' },
]

const CLOSE_TARGET = { width: REPORT_TAP_TARGET, height: REPORT_TAP_TARGET }

interface PanelSectionProps {
    section: CustomizeSection
    children: ReactNode
}

// The fold state is this panel's own: nothing else reads it, and a new open starts with
// only Number format unfolded.
function PanelSection({ section, children }: PanelSectionProps) {
    const [isOpen, setIsOpen] = useState(section === 'number-format')
    const color = useThemeColor('muted-foreground')
    const Caret = isOpen ? ChevronDown : ChevronRight
    return (
        <View className="border-b border-border">
            <Pressable
                testID={`report-customize-section-${section}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                aria-expanded={isOpen}
                onPress={() => setIsOpen(open => !open)}
                className="flex-row items-center gap-2"
                style={{ minHeight: REPORT_TAP_TARGET }}
            >
                <Caret size={16} color={color} />
                <Text className="text-sm font-semibold text-foreground">
                    {SECTION_TITLES[section]}
                </Text>
            </Pressable>
            <SectionBody isVisible={isOpen}>{children}</SectionBody>
        </View>
    )
}

function SectionBody({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return <View className="pb-2">{children}</View>
}

function NumberFormatFields({ model }: { model: ReportScreenModel }) {
    const { control, onOptionChange } = model.form
    return (
        <>
            <Toggle
                name="divideBy1000"
                control={control}
                label="Divide by 1000"
                testID="report-option-divide-by-1000"
                onValueChange={onOptionChange}
            />
            <Toggle
                name="withoutCents"
                control={control}
                label="Without cents"
                testID="report-option-without-cents"
                onValueChange={onOptionChange}
            />
            <ButtonGroup
                name="negative"
                control={control}
                label="Negative numbers"
                horizontal
                options={NEGATIVE_OPTIONS}
                onValueChange={onOptionChange}
            />
            <Toggle
                name="negativeRed"
                control={control}
                label="Show negative numbers in red"
                testID="report-option-negative-red"
                onValueChange={onOptionChange}
            />
        </>
    )
}

function RowsFields({ model }: { model: ReportScreenModel }) {
    return (
        <ButtonGroup
            name="rows"
            control={model.form.control}
            label="Show rows"
            horizontal
            options={ROWS_OPTIONS}
            onValueChange={model.form.onOptionChange}
        />
    )
}

function ColumnsByField({ model }: { model: ReportScreenModel }) {
    const choices = model.definition.columnsBy?.choices
    if (!choices) return null
    return (
        <SelectInput
            name="columnsBy"
            control={model.form.control}
            label="Display columns by"
            options={choices}
            testID="report-option-columns-by"
            onValueChange={model.form.onOptionChange}
        />
    )
}

function ColumnsFields({ model }: { model: ReportScreenModel }) {
    const { control, onOptionChange } = model.form
    const toggles = (model.definition.columnToggles ?? []).map(toggle => (
        <Toggle
            key={toggle.id}
            name={`columnToggles.${toggle.id}`}
            control={control}
            label={toggle.label}
            testID={`report-option-column-${toggle.id}`}
            onValueChange={onOptionChange}
        />
    ))
    return (
        <>
            <ColumnsByField model={model} />
            {toggles}
        </>
    )
}

function SectionFields({
    section,
    model,
}: {
    section: CustomizeSection
    model: ReportScreenModel
}) {
    if (section === 'number-format') return <NumberFormatFields model={model} />
    if (section === 'rows') return <RowsFields model={model} />
    return <ColumnsFields model={model} />
}

function CustomizeFields({ model }: { model: ReportScreenModel }) {
    const sections = model.customizeSections.map(section => (
        <PanelSection key={section} section={section}>
            <SectionFields section={section} model={model} />
        </PanelSection>
    ))
    return (
        <View>
            {sections}
            <View className="items-start pt-3">
                <Button
                    testID="report-customize-reset"
                    variant="outline"
                    style={{ minHeight: REPORT_TAP_TARGET }}
                    onPress={model.onReset}
                >
                    <ButtonText>Reset to defaults</ButtonText>
                </Button>
            </View>
        </View>
    )
}

function PanelTitle() {
    return <Text className="text-lg font-semibold text-foreground">Customize</Text>
}

// No Sheet title, so the Sheet draws no close button of its own: this row's button carries
// the same test id as the drawer's.
function CustomizeSheet({ model }: { model: ReportScreenModel }) {
    const closeColor = useThemeColor('foreground')
    return (
        <Sheet
            isOpen={model.isCustomizeOpen}
            onClose={model.onCloseCustomize}
            testID="report-customize"
        >
            <Sheet.Body>
                <View className="flex-row items-center justify-between">
                    <PanelTitle />
                    <Pressable
                        testID="report-customize-close"
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={model.onCloseCustomize}
                        className="items-center justify-center"
                        style={CLOSE_TARGET}
                    >
                        <X size={18} color={closeColor} />
                    </Pressable>
                </View>
                <CustomizeFields model={model} />
            </Sheet.Body>
        </Sheet>
    )
}

// Wide: inline beside the report, which stays visible and updates behind it. Tablet: an
// overlay from the right.
function CustomizeDrawer({ model }: { model: ReportScreenModel }) {
    const closeColor = useThemeColor('foreground')
    const isInline = model.breakpoint === 'desktop'
    return (
        <Drawer
            isOpen={model.isCustomizeOpen}
            onClose={model.onCloseCustomize}
            presentation={isInline ? 'inline' : 'overlay'}
            anchor="right"
            size="md"
        >
            <DrawerBackdrop />
            <DrawerContent
                testID="report-customize"
                role={isInline ? 'complementary' : 'dialog'}
                accessibilityLabel="Customize"
                className={isInline ? 'w-[360px]' : undefined}
            >
                <DrawerHeader className="border-b border-border">
                    <PanelTitle />
                    <DrawerCloseButton
                        testID="report-customize-close"
                        accessibilityLabel="Close"
                        className="items-center justify-center"
                        style={CLOSE_TARGET}
                    >
                        <X size={18} color={closeColor} />
                    </DrawerCloseButton>
                </DrawerHeader>
                <DrawerBody style={{ flexShrink: 1 }}>
                    <CustomizeFields model={model} />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}

export function ReportCustomizePanel({ model }: { model: ReportScreenModel }) {
    if (model.breakpoint === 'mobile') return <CustomizeSheet model={model} />
    return <CustomizeDrawer model={model} />
}
