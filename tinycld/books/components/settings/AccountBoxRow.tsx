import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { SelectInput, useForm, zodResolver } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { useAccountBoxMutation } from '../../hooks/useAccountBoxMutation'
import { box1099ValueSchema } from '../../lib/box-1099-schema'
import { box1099Label, box1099Options } from '../../lib/form-1099'
import type { Form1099AccountRow } from '../../lib/form-1099-accounts'
import type { BooksAccounts } from '../../types'

const DEPTH_PADDING = ['', 'pl-4', 'pl-8', 'pl-12', 'pl-16']

interface BoxControlProps {
    row: Form1099AccountRow
    editsBoxes: boolean
    isStacked: boolean
    shownBox: BooksAccounts['form_1099_box']
    isPending: boolean
    onChoose: (box: string) => void
}

function BoxSelect({ row, isStacked, shownBox, isPending, onChoose }: BoxControlProps) {
    // The live shown box feeds the form, so a refused write puts the stored box back.
    const { control } = useForm({
        resolver: zodResolver(box1099ValueSchema),
        values: { box: shownBox },
    })
    const width = isStacked ? 'w-full' : 'w-80'
    return (
        <View className={width}>
            <SelectInput
                control={control}
                name="box"
                label={`1099 box for ${row.label}`}
                hideLabel
                options={box1099Options()}
                disabled={isPending}
                onValueChange={onChoose}
                wrapperProps={{ className: 'gap-1.5' }}
                testID={`books-1099-box-select-${row.id}`}
            />
        </View>
    )
}

function BoxText({ row, isStacked }: Pick<BoxControlProps, 'row' | 'isStacked'>) {
    const tone = row.box === '' ? 'text-muted-foreground' : 'text-foreground'
    const align = isStacked ? '' : 'w-80 text-right'
    return (
        <Text className={`text-sm ${tone} ${align}`} testID={`books-1099-box-text-${row.id}`}>
            {box1099Label(row.box)}
        </Text>
    )
}

function BoxControl(props: BoxControlProps) {
    if (!props.editsBoxes) return <BoxText row={props.row} isStacked={props.isStacked} />
    return <BoxSelect {...props} />
}

function InactiveMark({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-xs text-muted-foreground">Inactive</Text>
}

function RowRefusal({
    id,
    message,
    isVisible,
}: {
    id: string
    message: string | null
    isVisible: boolean
}) {
    if (!isVisible) return null
    return (
        <Text
            accessibilityRole="alert"
            className="text-xs text-danger"
            testID={`books-1099-account-error-${id}`}
        >
            {message}
        </Text>
    )
}

export function AccountBoxRow({
    row,
    editsBoxes,
}: {
    row: Form1099AccountRow
    editsBoxes: boolean
}) {
    const isStacked = useBreakpoint() === 'mobile'
    const { chooseBox, shownBox, isPending, error } = useAccountBoxMutation(row)
    // Tree depth starts at 1, so a top-level row has no indent.
    const indent = DEPTH_PADDING[Math.min(row.depth - 1, DEPTH_PADDING.length - 1)]
    const dim = row.inactive ? 'opacity-60' : ''
    // Wide rows indent the label only, so the selects stay one column; a stacked row
    // indents the select with its label.
    const line = isStacked ? `gap-2 ${indent}` : 'flex-row items-center gap-3'
    const labelBlock = isStacked ? 'min-w-0' : `min-w-0 flex-1 ${indent}`
    return (
        <View
            className={`gap-1 border-b border-border py-3 ${dim}`}
            testID={`books-1099-account-row-${row.id}`}
        >
            <View className={line}>
                <View className={labelBlock}>
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                        {row.label}
                    </Text>
                    <InactiveMark isVisible={row.inactive} />
                </View>
                <BoxControl
                    row={row}
                    editsBoxes={editsBoxes}
                    isStacked={isStacked}
                    shownBox={shownBox}
                    isPending={isPending}
                    onChoose={chooseBox}
                />
            </View>
            <RowRefusal id={row.id} message={error} isVisible={error !== null} />
        </View>
    )
}
