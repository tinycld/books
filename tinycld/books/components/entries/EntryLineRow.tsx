import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { SelectInput } from '@tinycld/core/ui/form'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import { useFormContext, useFormState } from 'react-hook-form'
import { Platform, Pressable, Text, View, type ViewInstance } from 'react-native'
import { useClearStaleErrors } from '../../hooks/useClearStaleErrors'
import type { EntryFormValues } from '../../lib/entry-schema'
import type { FocusNode, LineColumn } from '../../lib/line-focus'
import { AmountCell, MemoCell } from './AmountCell'
import { LINE_COLUMNS } from './EntryLineTable'

export interface LineActions {
    onAdd(): void
    onRemove(index: number): void
    onMoveUp(index: number): void
    onMoveDown(index: number): void
    register(index: number, column: LineColumn): (node: FocusNode | null) => void
    focus(index: number, column: LineColumn): void
    submit(index: number, column: LineColumn): void
}

interface LineProps {
    index: number
    lineCount: number
    currency: string
    options: { value: string; label: string }[]
    actions: LineActions
}

// The select trigger is not a ref target, so the wrapper finds the focusable node
// inside it on web. A phone has no focus ring to move, so its keyboard goes to the debit.
function accountFocusNode(
    node: unknown,
    index: number,
    actions: Pick<LineActions, 'focus'>
): FocusNode {
    return {
        focus() {
            if (Platform.OS !== 'web') {
                actions.focus(index, 'debit')
                return
            }
            const root = node as HTMLElement
            const target = root.querySelector<HTMLElement>('[tabindex="0"]') ?? root
            target.focus()
        },
    }
}

export function AccountPick({
    index,
    options,
    actions,
}: Pick<LineProps, 'index' | 'options' | 'actions'>) {
    const { control } = useFormContext<EntryFormValues>()
    const { onEdit } = useClearStaleErrors()
    const register = actions.register(index, 'account')
    const setRef = (node: ViewInstance | null) =>
        register(node ? accountFocusNode(node, index, actions) : null)
    return (
        <View ref={setRef} className="min-w-0">
            <SelectInput
                name={`lines.${index}.account`}
                control={control}
                label={`Line ${index + 1} account`}
                hideLabel
                hideError
                onValueChange={onEdit}
                options={options}
                placeholder="Choose account"
                testID={`entry-line-account-${index}`}
                wrapperProps={{ style: { marginBottom: 0, minWidth: 0 } }}
            />
        </View>
    )
}

export function LineMenu({
    index,
    lineCount,
    actions,
}: Pick<LineProps, 'index' | 'lineCount' | 'actions'>) {
    const color = useThemeColor('muted-foreground')
    return (
        <Menu
            // A move keeps the row mounted but changes its index; a new key drops the
            // sheet that is still closing under the old index.
            key={index}
            title={`Line ${index + 1}`}
            placement="bottom-end"
            trigger={
                <Pressable
                    testID={`entry-line-menu-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Actions for line ${index + 1}`}
                    className="items-center justify-center"
                    style={{ width: 44, minHeight: 44 }}
                >
                    <EllipsisVertical size={18} color={color} />
                </Pressable>
            }
        >
            <Menu.Item
                label="Move up"
                isDisabled={index === 0}
                onSelect={() => actions.onMoveUp(index)}
            />
            <Menu.Item
                label="Move down"
                isDisabled={index === lineCount - 1}
                onSelect={() => actions.onMoveDown(index)}
            />
            <Menu.Item label="Delete line" isDestructive onSelect={() => actions.onRemove(index)} />
        </Menu>
    )
}

// Field errors and a server refusal of this line sit under it, where the eye already is.
export function LineError({ index }: { index: number }) {
    const { control } = useFormContext<EntryFormValues>()
    const { errors } = useFormState({ control })
    const line = errors.lines?.[index]
    const messages = [
        line?.account?.message,
        line?.debit?.message,
        line?.credit?.message,
        errors.root?.[`line${index}`]?.message,
    ].filter((message): message is string => typeof message === 'string' && message !== '')
    if (messages.length === 0) return null
    const texts = messages.map(message => (
        <Text key={message} className="text-xs text-destructive">
            {message}
        </Text>
    ))
    return (
        <View testID={`entry-line-error-${index}`} className="gap-0.5 px-1 pb-1">
            {texts}
        </View>
    )
}

export function EntryLineRow({ index, lineCount, currency, options, actions }: LineProps) {
    return (
        <View className="border-b border-border">
            <LineFields
                index={index}
                lineCount={lineCount}
                currency={currency}
                options={options}
                actions={actions}
            />
            <LineError index={index} />
        </View>
    )
}

function LineFields({ index, lineCount, currency, options, actions }: LineProps) {
    return (
        <View
            testID={`entry-line-${index}`}
            className="flex-row items-start gap-2 px-2 py-1"
            style={{ minHeight: 52 }}
        >
            <View style={LINE_COLUMNS.index} className="items-center justify-center">
                <Text
                    className="text-sm text-muted-foreground"
                    style={{ minHeight: 44, lineHeight: 44 }}
                >
                    {index + 1}
                </Text>
            </View>
            <View style={LINE_COLUMNS.account} className="min-w-0">
                <AccountPick index={index} options={options} actions={actions} />
            </View>
            <View style={LINE_COLUMNS.debit}>
                <AmountCell side="debit" index={index} currency={currency} actions={actions} />
            </View>
            <View style={LINE_COLUMNS.credit}>
                <AmountCell side="credit" index={index} currency={currency} actions={actions} />
            </View>
            <View style={LINE_COLUMNS.memo} className="min-w-0">
                <MemoCell index={index} actions={actions} />
            </View>
            <View style={LINE_COLUMNS.menu}>
                <LineMenu index={index} lineCount={lineCount} actions={actions} />
            </View>
        </View>
    )
}
