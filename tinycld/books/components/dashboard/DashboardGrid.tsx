import { View } from 'react-native'
import { columnsFor, gridRows } from '../../lib/dashboard-layout'
import { shownWidgets, type WidgetId } from '../../lib/dashboard-prefs'
import { DASHBOARD_WIDGETS, type WidgetProps } from './widgets'

// The cell, not the card, takes the flex share, so every column has one width and a
// padded cell keeps the column width of the row above.
const CELL_STYLE = { flex: 1, minWidth: 0 }

function GridCell({ widget, props }: { widget: WidgetId | null; props: WidgetProps }) {
    if (!widget) return <View style={CELL_STYLE} />
    const Widget = DASHBOARD_WIDGETS[widget]
    return (
        <View style={CELL_STYLE}>
            <Widget {...props} />
        </View>
    )
}

function GridRow({ row, props }: { row: (WidgetId | null)[]; props: WidgetProps }) {
    const cells = row.map((widget, index) => (
        <GridCell key={widget ?? `gap-${index}`} widget={widget} props={props} />
    ))
    return <View className="flex-row gap-4">{cells}</View>
}

// The shown widgets in the user's order, in rows of as many columns as the page's width
// takes (plan D5). `pageWidth` is the dashboard screen's own width, padding included, as
// measured by the screen. Nothing draws before the first layout, so the grid never
// starts with the wrong column count.
export function DashboardGrid({
    pageWidth,
    ...gridProps
}: Omit<WidgetProps, 'isOneColumn'> & { pageWidth: number }) {
    const columns = columnsFor(pageWidth)
    const props: WidgetProps = { ...gridProps, isOneColumn: columns === 1 }
    const rows = pageWidth > 0 ? gridRows(shownWidgets(props.prefs), columns) : []
    const drawnRows = rows.map(row => <GridRow key={row.join('-')} row={row} props={props} />)
    return (
        <View testID="dashboard-grid" className="gap-4">
            {drawnRows}
        </View>
    )
}
