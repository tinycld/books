import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ArrowLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { RegisterScreenModel } from '../../hooks/useRegisterScreen'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { accountDisplay } from '../accounts/account-display'
import { RegisterRangeSelect } from './RegisterRangeSelect'

function BackLink({ onBack }: { onBack: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="register-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Chart of Accounts</Text>
        </Pressable>
    )
}

function InactiveLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="register-inactive" className="text-xs italic text-muted-foreground">
            Inactive
        </Text>
    )
}

function AccountNumber({ number }: { number: string }) {
    if (!number) return null
    return <Text className="text-sm text-muted-foreground">{number}</Text>
}

function TitleBlock({ model }: { model: RegisterScreenModel }) {
    const { account } = model
    if (!account) return null
    const { typeLabel, detailLabel } = accountDisplay(account.type, account.detail_type)
    return (
        <View testID="register-title" className="min-w-0 gap-0.5">
            <View className="flex-row flex-wrap items-baseline gap-2">
                <AccountNumber number={account.number} />
                <Text className="text-2xl font-semibold text-foreground">{account.name}</Text>
                <InactiveLabel isVisible={account.inactive} />
            </View>
            <Text className="text-xs text-muted-foreground">
                {typeLabel} · {detailLabel}
            </Text>
        </View>
    )
}

function figureText(cents: number | null, currency: string) {
    return cents === null ? 'Too large' : formatMoney(cents, currency)
}

function BalanceFigure({
    testID,
    label,
    cents,
    currency,
    isLarge,
    children,
}: {
    testID: string
    label: string
    cents: number | null
    currency: string
    isLarge: boolean
    children?: ReactNode
}) {
    const size = isLarge ? 'text-2xl font-semibold' : 'text-base font-medium'
    const isNegative = cents === null || cents < 0
    const tone = isNegative ? 'text-danger' : 'text-foreground'
    return (
        <View className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text testID={testID} className={`${size} ${tone}`}>
                {figureText(cents, currency)}
            </Text>
            {children}
        </View>
    )
}

function ParentNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="register-parent-note" className="text-xs text-muted-foreground">
            Own transactions only
        </Text>
    )
}

function BalanceBlock({ model }: { model: RegisterScreenModel }) {
    const { register, currency, range } = model
    return (
        <View className="gap-1">
            <View className="flex-row items-start gap-6">
                <BalanceFigure
                    testID="register-opening-balance"
                    label="Opening balance"
                    cents={register.openingBalance}
                    currency={currency}
                    isLarge={false}
                />
                <BalanceFigure
                    testID="register-ending-balance"
                    label="Ending balance"
                    cents={register.endingBalance}
                    currency={currency}
                    isLarge
                >
                    <Text
                        testID="register-balance-through"
                        className="text-xs text-muted-foreground"
                    >
                        through {formatDay(range.end)}
                    </Text>
                </BalanceFigure>
            </View>
            <ParentNote isVisible={model.hasSubAccounts} />
        </View>
    )
}

function NewEntryButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="register-new-entry" style={{ minHeight: 44 }} onPress={onPress}>
            <ButtonText>New journal entry</ButtonText>
        </Button>
    )
}

function Controls({ model, isVisible }: { model: RegisterScreenModel; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="flex-row flex-wrap items-center gap-3">
            <RegisterRangeSelect preset={model.preset} onPreset={model.onPreset} />
            <NewEntryButton isVisible={model.isNewEntryVisible} onPress={model.onNewEntry} />
        </View>
    )
}

function BalanceSlot({ model, isVisible }: { model: RegisterScreenModel; isVisible: boolean }) {
    if (!isVisible) return null
    return <BalanceBlock model={model} />
}

const SHOWS_FIGURES = new Set(['ready', 'empty', 'empty-range'])

export function RegisterHeader({ model }: { model: RegisterScreenModel }) {
    const showFigures = SHOWS_FIGURES.has(model.state)
    const layout = model.isWide ? 'flex-row items-end justify-between gap-4' : 'gap-3'
    return (
        <View className="gap-2 border-b border-border px-4 pb-3 pt-2">
            <BackLink onBack={model.onBack} />
            <View className={layout}>
                <TitleBlock model={model} />
                <BalanceSlot model={model} isVisible={showFigures} />
            </View>
            <Controls model={model} isVisible={showFigures} />
        </View>
    )
}

export function BackOnlyHeader({ onBack }: { onBack: () => void }) {
    return (
        <View className="border-b border-border px-4 pb-3 pt-2">
            <BackLink onBack={onBack} />
        </View>
    )
}
