import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { useController, useFormContext } from 'react-hook-form'
import { Platform } from 'react-native'
import { useClearStaleErrors } from '../../hooks/useClearStaleErrors'
import { formatAmountOnBlur, shouldClearOtherSide } from '../../lib/entry-lines'
import type { EntryFormValues } from '../../lib/entry-schema'
import type { LineActions } from './EntryLineRow'

type CellColumn = 'debit' | 'credit' | 'memo'

type CellActions = Pick<LineActions, 'register' | 'submit'>

interface CellInputProps {
    index: number
    column: CellColumn
    label: string
    isRight: boolean
    placeholder?: string
    keyboardType?: 'decimal-pad'
    onChangeText?: (text: string) => void
    onBlurText?: (text: string) => string
    actions: CellActions
}

// A form cell needs min-width 0 so it shares its column; core TextInput's inner row does not
// allow that on web (the input keeps its intrinsic width), so the cells bind PlainInput directly.
function CellInput(props: CellInputProps) {
    const { index, column, label, isRight, placeholder, keyboardType } = props
    const { control } = useFormContext<EntryFormValues>()
    const color = useThemeColor('foreground')
    const placeholderColor = useThemeColor('field-placeholder')
    const { field } = useController({ control, name: `lines.${index}.${column}` })
    const onChangeText = (text: string) => {
        field.onChange(text)
        props.onChangeText?.(text)
    }
    const onBlur = () => {
        if (props.onBlurText) field.onChange(props.onBlurText(field.value))
        field.onBlur()
    }
    return (
        <PlainInput
            accessibilityLabel={label}
            testID={`entry-line-${column}-${index}`}
            placeholder={placeholder}
            placeholderTextColor={placeholderColor}
            value={field.value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            ref={props.actions.register(index, column)}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => props.actions.submit(index, column)}
            keyboardType={keyboardType}
            textAlign={isRight ? 'right' : 'left'}
            className="rounded-lg border border-border bg-background px-3 text-base text-foreground"
            style={{ minHeight: 44, width: '100%', minWidth: 0, color }}
        />
    )
}

interface AmountCellProps {
    side: 'debit' | 'credit'
    index: number
    currency: string
    actions: CellActions
}

export function AmountCell({ side, index, currency, actions }: AmountCellProps) {
    const { setValue } = useFormContext<EntryFormValues>()
    const { onAmountEdit } = useClearStaleErrors()
    const other = side === 'debit' ? 'credit' : 'debit'
    // The sibling is cleared in the change event itself, never from a watch or an effect.
    const clearOther = (text: string) => {
        if (shouldClearOtherSide(text)) {
            setValue(`lines.${index}.${other}`, '', { shouldDirty: true })
        }
        onAmountEdit()
    }
    return (
        <CellInput
            index={index}
            column={side}
            label={`Line ${index + 1} ${side}`}
            isRight
            actions={actions}
            keyboardType={Platform.OS === 'web' ? undefined : 'decimal-pad'}
            onChangeText={clearOther}
            onBlurText={text => formatAmountOnBlur(text, currency)}
        />
    )
}

interface MemoCellProps {
    index: number
    actions: CellActions
}

export function MemoCell({ index, actions }: MemoCellProps) {
    const { onEdit } = useClearStaleErrors()
    return (
        <CellInput
            index={index}
            column="memo"
            label={`Line ${index + 1} memo`}
            placeholder="Line memo"
            isRight={false}
            onChangeText={onEdit}
            actions={actions}
        />
    )
}
