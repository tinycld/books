import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { ADJUSTMENT_CARD_HALF_MIN } from '../../lib/adjustment-columns'
import {
    type AdjustmentLinesProps,
    BinCell,
    ChangeCell,
    ItemCell,
    type LineCellProps,
    LineError,
    LineMenu,
    lineCellPropsOf,
    lineRowId,
    NewQuantityCell,
    OnHandCell,
    ValueCell,
} from './AdjustmentLineCells'

const CARD = 'gap-3 rounded-xl border border-border bg-background p-3'
const LABEL = 'text-xs font-semibold text-muted-foreground'
const HALF = { flex: 1, minWidth: ADJUSTMENT_CARD_HALF_MIN }

function Labelled({ label, children }: { label: string; children: ReactNode }) {
    return (
        <View className="min-w-0 gap-1">
            <Text className={LABEL}>{label}</Text>
            {children}
        </View>
    )
}

function CardBin({ isVisible, props }: { isVisible: boolean; props: LineCellProps }) {
    if (!isVisible) return null
    return (
        <Labelled label="Bin">
            <BinCell {...props} />
        </Labelled>
    )
}

function LineCard({ props, hasBins }: { props: LineCellProps; hasBins: boolean }) {
    const { lineFocus, line, index, view } = props
    const onFocus = () => lineFocus.onFocus(line.id)
    const onBlur = () => lineFocus.onBlur(line.id)
    return (
        <View testID={lineRowId(index)} className={CARD} onFocus={onFocus} onBlur={onBlur}>
            <View className="flex-row items-center justify-between gap-2">
                <Text className="text-sm font-semibold text-foreground">Line {view.number}</Text>
                <LineMenu {...props} />
            </View>
            <Labelled label="Item">
                <ItemCell {...props} />
            </Labelled>
            <CardBin isVisible={hasBins} props={props} />
            <OnHandCell view={view} index={index} isInline />
            <View className="flex-row gap-3">
                <View style={HALF}>
                    <Labelled label="New quantity">
                        <NewQuantityCell {...props} />
                    </Labelled>
                </View>
                <View style={HALF}>
                    <Labelled label="Change">
                        <ChangeCell {...props} />
                    </Labelled>
                </View>
            </View>
            <Labelled label="Value change">
                <ValueCell {...props} />
            </Labelled>
            <LineError view={view} index={index} />
        </View>
    )
}

/**
 * The adjustment's lines as cards (inventory-adjust spec §3.3), below the table's least
 * width: "Line n" with the row menu; Item; Bin (while the book has a bin); "On hand 12 of
 * 40"; New quantity and Change side by side, each at least 140 px; Value change; the line's
 * own message.
 */
export function AdjustmentLineCards(props: AdjustmentLinesProps) {
    const cards = props.fields.map((field, index) => {
        const cellProps = lineCellPropsOf(props, index)
        if (!cellProps) return null
        return <LineCard key={field.key} props={cellProps} hasBins={props.hasBins} />
    })
    return (
        <View testID="inventory-adjustment-lines-cards" className="gap-3">
            {cards}
        </View>
    )
}
