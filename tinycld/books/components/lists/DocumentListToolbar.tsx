import { PickMenu } from '@tinycld/core/ui/pick-menu'
import type { ReactNode, RefObject } from 'react'
import { ScrollView, type TextInputInstance, View } from 'react-native'
import type { useDocumentListScreen } from '../../hooks/useDocumentListScreen'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import type { DocumentListTab, TabReport } from '../../lib/document-list'
import { RANGE_ITEMS, sortMenuItems } from '../../lib/document-list-menus'
import { areaOf, type ListArea } from '../../lib/list-areas'
import { ListFilterChips } from '../ListFilterChips'
import { SearchField } from '../ListToolbar'
import { ShippedReportButton } from '../reports/ShippedReportButton'
import { DocumentPartyFilter } from './DocumentPartyFilter'

type Screen = ReturnType<typeof useDocumentListScreen>

interface PartProps {
    screen: Screen
    tab: DocumentListTab
    area: ListArea
}

function RangeMenu({ screen, area }: { screen: Screen; area: ListArea }) {
    const range = screen.filters.range
    const items = RANGE_ITEMS.map(item => ({
        id: item.id,
        label: item.label,
        isSelected: item.id === range,
        onSelect: () => screen.setRange(item.id),
    }))
    const label = RANGE_ITEMS.find(item => item.id === range)?.label ?? ''
    return (
        <PickMenu
            testID={`${area.testIdPrefix}-range`}
            purpose="Date range"
            label={label}
            size="touch"
            items={items}
        />
    )
}

// Cards have no header, so the toolbar holds the sort: each sortable column, both ways.
function SortMenu({ screen, tab, area, isVisible }: PartProps & { isVisible: boolean }) {
    if (!isVisible) return null
    const { sort } = screen
    const items = sortMenuItems(tab).map(item => ({
        id: item.id,
        label: item.label,
        isSelected: item.sort.key === sort.key && item.sort.isAscending === sort.isAscending,
        onSelect: () => screen.setSort(item.sort),
    }))
    const chosen = items.find(item => item.isSelected)?.label ?? ''
    return (
        <PickMenu
            testID={`${area.testIdPrefix}-sort`}
            purpose="Sort"
            label={`Sort: ${chosen}`}
            size="touch"
            items={items}
        />
    )
}

const NO_GROW = { flexGrow: 0 }
const WIDE_PARTY_STYLE = { width: 220 }
const PHONE_PARTY_STYLE = { width: 180 }

function PartyFilter({
    screen,
    area,
    isPhone,
}: {
    screen: Screen
    area: ListArea
    isPhone: boolean
}) {
    const style = isPhone ? PHONE_PARTY_STYLE : WIDE_PARTY_STYLE
    return (
        <View style={style}>
            <DocumentPartyFilter
                area={area}
                value={screen.filters.party}
                onChange={screen.setParty}
            />
        </View>
    )
}

function Chips({ screen, tab, area, scrolls }: PartProps & { scrolls: boolean }) {
    return (
        <ListFilterChips
            chips={tab.chips}
            selected={screen.filters.chip}
            testIdPrefix={`${area.testIdPrefix}-chip`}
            onSelect={screen.setChip}
            scrolls={scrolls}
            gutterClass="px-4"
        />
    )
}

function Search({
    screen,
    area,
    isWide,
    inputRef,
}: {
    screen: Screen
    area: ListArea
    isWide: boolean
    inputRef?: RefObject<TextInputInstance | null>
}) {
    const search = { query: screen.filters.search, setQuery: screen.setSearch }
    return (
        <SearchField
            testIdPrefix={area.testIdPrefix}
            placeholder={area.texts.searchPlaceholder}
            list={search}
            isWide={isWide}
            inputRef={inputRef}
            size="touch"
        />
    )
}

function ReportLink({ report, area }: { report: TabReport; area: ListArea }) {
    // Null while the report loads, when its read fails and when the reader has none: then
    // the button is not drawn and the toolbar stays usable.
    const href = useShippedReportHref(report.shippedKey)
    return (
        <ShippedReportButton
            href={href}
            label={report.label}
            testID={`${area.testIdPrefix}-${report.testIdSuffix}`}
        />
    )
}

// The tab's report link (`DocumentListTab.report`); nothing on a tab with none.
function TabReportLink({ tab, area }: { tab: DocumentListTab; area: ListArea }) {
    if (tab.report === undefined) return null
    return <ReportLink report={tab.report} area={area} />
}

interface DocumentListToolbarProps {
    screen: Screen
    tab: DocumentListTab
    isPhone: boolean
    // The Batch actions control: at the end of the table's row, beside the search with cards.
    batch?: ReactNode
    // The search field's ref, for a list key that focuses it; Escape in it then blurs it.
    inputRef?: RefObject<TextInputInstance | null>
}

/**
 * The full list's toolbar (the Sales lists design spec §3): the search field,
 * the status chips, the date-range menu and the party picker (the area's customer or
 * vendor), with the Sort menu when the list draws cards and the tab's report link when it
 * has one. Wide, they share one wrapping row; on a phone the search takes the first row,
 * the chips scroll sideways on the second, and the date range, the party, the sort and the
 * report link share a third that scrolls sideways. The
 * 320 px names column has none of it (`showFilters`). It draws in every state, so a filter
 * that led to a refused or empty list can still be changed.
 */
export function DocumentListToolbar({
    screen,
    tab,
    isPhone,
    batch,
    inputRef,
}: DocumentListToolbarProps) {
    const area = areaOf(tab)
    if (!screen.controls.showFilters) return null
    const { drawsCards } = screen
    if (isPhone) {
        return (
            <View className="gap-2 pb-3 pt-3">
                <View className="flex-row items-center gap-2 px-4">
                    <Search screen={screen} area={area} isWide={false} inputRef={inputRef} />
                    {batch}
                </View>
                <Chips screen={screen} tab={tab} area={area} scrolls />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={NO_GROW}>
                    <View className="flex-row items-center gap-2 px-4">
                        <RangeMenu screen={screen} area={area} />
                        <PartyFilter screen={screen} area={area} isPhone />
                        <SortMenu screen={screen} tab={tab} area={area} isVisible={drawsCards} />
                        <TabReportLink tab={tab} area={area} />
                    </View>
                </ScrollView>
            </View>
        )
    }
    // With cards the batch icon sits beside the search, so it never wraps to a row of its
    // own; with the table the labelled button ends the row.
    const batchBySearch = drawsCards ? batch : null
    const batchAtEnd = drawsCards ? null : batch
    return (
        <View className="flex-row flex-wrap items-center gap-2 px-4 pb-3 pt-3">
            <Search screen={screen} area={area} isWide inputRef={inputRef} />
            {batchBySearch}
            <Chips screen={screen} tab={tab} area={area} scrolls={false} />
            <RangeMenu screen={screen} area={area} />
            <PartyFilter screen={screen} area={area} isPhone={false} />
            <SortMenu screen={screen} tab={tab} area={area} isVisible={drawsCards} />
            <TabReportLink tab={tab} area={area} />
            {batchAtEnd}
        </View>
    )
}
