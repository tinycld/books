import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { Plus } from 'lucide-react-native'
import type { ReactElement } from 'react'
import { Pressable, Text } from 'react-native'
import type { ReportScreenModel } from '../../hooks/useReportScreen'
import type { FilterSpec } from '../../lib/report-definition'
import type { ControlRowItem } from '../../lib/report-state'
import { ReportAccountFilterPicker } from './ReportAccountFilterPicker'
import { ReportFilterChip } from './ReportFilterChip'
import { REPORT_TAP_TARGET } from './ReportHeader'

function pickerFilterId(model: ReportScreenModel): string | null {
    return model.surface?.kind === 'filter-picker' ? model.surface.filterId : null
}

interface FilterPickerProps {
    spec: FilterSpec
    trigger: ReactElement
    model: ReportScreenModel
}

function FilterPicker({ spec, trigger, model }: FilterPickerProps) {
    return (
        <ReportAccountFilterPicker
            spec={spec}
            trigger={trigger}
            isOpen={pickerFilterId(model) === spec.id}
            draft={model.pickerDraft}
            rows={model.accountPickerRows}
            onApply={values => model.onApplyFilter(spec.id, values)}
            onClose={() => model.onCloseSurfaceOf('filter-picker')}
        />
    )
}

// The chip is the trigger of its own picker.
function ActiveFilterChip({ spec, model }: { spec: FilterSpec; model: ReportScreenModel }) {
    const chip = (
        <ReportFilterChip
            spec={spec}
            value={model.chipValues[spec.id] ?? ''}
            onPress={() => model.onOpenSurface({ kind: 'filter-picker', filterId: spec.id })}
            onRemove={() => model.onRemoveFilter(spec.id)}
        />
    )
    return <FilterPicker spec={spec} trigger={chip} model={model} />
}

// An element, not a component: the Menu and the Popover clone their trigger with a ref and
// an onPress, which a plain Pressable takes as they are.
function addFilterChip(iconColor: string) {
    return (
        <Pressable
            testID="report-add-filter"
            accessibilityRole="button"
            accessibilityLabel="Add filter"
            className="flex-row items-center gap-1.5 rounded-full border border-border bg-secondary px-3"
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <Plus size={14} color={iconColor} />
            <Text numberOfLines={1} className="text-sm text-secondary-foreground">
                Add filter
            </Text>
        </Pressable>
    )
}

// The picker of a filter that is not active yet anchors on the "Add filter" chip, which
// then stands in for the menu that opened it.
function AddFilterControl({ model }: { model: ReportScreenModel }) {
    const muted = useThemeColor('muted-foreground')
    const trigger = addFilterChip(muted)
    const pickingId = pickerFilterId(model)
    const picking = model.addableFilters.find(spec => spec.id === pickingId)
    if (picking) return <FilterPicker spec={picking} trigger={trigger} model={model} />

    // An item opens its picker before the menu closes itself, so the close only clears
    // the menu's own surface.
    const onOpenChange = (open: boolean) => {
        if (open) model.onOpenSurface({ kind: 'add-filter' })
        else model.onCloseSurfaceOf('add-filter')
    }
    const items = model.addableFilters.map(spec => (
        <Menu.Item
            key={spec.id}
            label={spec.label}
            testID={`report-add-filter-${spec.id}`}
            onSelect={() => model.onOpenSurface({ kind: 'filter-picker', filterId: spec.id })}
        />
    ))
    return (
        <Menu
            trigger={trigger}
            isOpen={model.surface?.kind === 'add-filter'}
            onOpenChange={onOpenChange}
            title="Add filter"
            sheetSide="bottom"
            testID="report-add-filter-menu"
        >
            {items}
        </Menu>
    )
}

function FilterControl({ item, model }: { item: ControlRowItem; model: ReportScreenModel }) {
    if (item.kind === 'filter') return <ActiveFilterChip spec={item.filter} model={model} />
    if (item.kind === 'add-filter') return <AddFilterControl model={model} />
    return null
}

function filterKey(item: ControlRowItem): string {
    return item.kind === 'filter' ? `filter-${item.filter.id}` : item.kind
}

// The active filter chips, then "Add filter", in the order of the control row.
export function ReportFilterChips({ model }: { model: ReportScreenModel }) {
    const chips = model.controlItems.map(item => (
        <FilterControl key={filterKey(item)} item={item} model={model} />
    ))
    return <>{chips}</>
}
