import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import type { MatchOption } from '../../../hooks/useBankMatch'
import { formatMoney } from '../../../lib/money'
import { SelectBox } from '../../SelectBox'

const ROW_STYLE = { minHeight: 44 }

// What the row draws of a Books transaction; Added to Books draws its entry with it too.
export type OptionRowEntry = Pick<
    MatchOption,
    'lineId' | 'label' | 'href' | 'dateText' | 'name' | 'amount'
>

type MatchOptionRowProps = {
    option: OptionRowEntry
    isChosen: boolean
    isDisabled: boolean
    // False for a reader: the row is a link only.
    canChoose: boolean
    onToggle: () => void
    currency: string
}

function OptionBox({ option, isChosen, isDisabled, canChoose, onToggle }: MatchOptionRowProps) {
    if (!canChoose) return null
    const state = isChosen ? 'checked' : 'empty'
    return (
        <SelectBox
            testID={`bank-match-box-${option.lineId}`}
            label={`Choose ${option.label}`}
            state={state}
            isDisabled={isDisabled}
            onPress={onToggle}
            tabIndex={0}
        />
    )
}

// The type and number, opening the Books transaction (entryHref) as a real link, so the
// web gets an href.
function OptionLink({ option }: { option: OptionRowEntry }) {
    const orgHref = useOrgHref()
    const href = orgHref(option.href)
    return (
        <Link href={href} asChild>
            <Pressable
                testID={`bank-match-link-${option.lineId}`}
                accessibilityRole="link"
                className="min-w-0 flex-shrink self-center web:cursor-pointer"
            >
                <Text numberOfLines={1} className="text-sm text-primary">
                    {option.label}
                </Text>
            </Pressable>
        </Link>
    )
}

// One Books transaction of the Match section. Line 1: the box (writers), the type and
// number as a link and the amount; line 2: "date · name" (the date alone when the entry
// has no customer or vendor). Two lines at every width: the inline drawer is 380 wide.
export function MatchOptionRow(props: MatchOptionRowProps) {
    const { option, currency } = props
    const amount = formatMoney(option.amount, currency)
    const detail = [option.dateText, option.name].filter(Boolean).join(' · ')
    return (
        <View
            testID={`bank-match-option-${option.lineId}`}
            className="flex-row items-center gap-2"
            style={ROW_STYLE}
        >
            <OptionBox {...props} />
            <View className="min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                    <OptionLink option={option} />
                    <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
                </View>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {detail}
                </Text>
            </View>
        </View>
    )
}
