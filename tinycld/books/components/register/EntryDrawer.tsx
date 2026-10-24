import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useRecord } from '@tinycld/core/lib/use-record'
import {
    Drawer,
    DrawerBackdrop,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerHeader,
} from '@tinycld/core/ui/drawer'
import { X } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { amountText } from '../../lib/money'
import { type EntryDetail, entryNumberLabel } from '../../lib/register'
import { formatDay } from '../../lib/register-range'

interface Placement {
    isWide: boolean
    isTablet: boolean
}

interface PlacementProps {
    presentation: 'inline' | 'overlay'
    anchor: 'right' | 'bottom'
    size: 'md'
}

function placementProps({ isWide, isTablet }: Placement): PlacementProps {
    if (isWide && !isTablet) return { presentation: 'inline', anchor: 'right', size: 'md' }
    if (isTablet) return { presentation: 'overlay', anchor: 'right', size: 'md' }
    return { presentation: 'overlay', anchor: 'bottom', size: 'md' }
}

function isInline({ isWide, isTablet }: Placement) {
    return isWide && !isTablet
}

function contentClass({ isWide, isTablet }: Placement) {
    return isInline({ isWide, isTablet }) ? 'w-[380px]' : undefined
}

function Field({ id, label, value }: { id: string; label: string; value: string }) {
    return (
        <View testID={`register-drawer-field-${id}`} className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground">{value}</Text>
        </View>
    )
}

type DetailLine = EntryDetail['lines'][number]

function LineAccountName({ accountId }: { accountId: string }) {
    const [accountsCollection] = useStore('books_accounts')
    const { record } = useRecord(accountsCollection, accountId)
    return (
        <Text numberOfLines={2} className="min-w-0 flex-1 text-sm text-foreground">
            {record?.name ?? ''}
        </Text>
    )
}

function LineMemo({ memo }: { memo: string }) {
    if (memo === '') return null
    return (
        <Text numberOfLines={2} className="text-xs text-muted-foreground">
            {memo}
        </Text>
    )
}

function DrawerLine({ line, currency }: { line: DetailLine; currency: string }) {
    const bg = line.isThisAccount ? 'bg-accent' : ''
    return (
        <View
            testID={`register-drawer-line-${line.id}`}
            className={`gap-0.5 border-b border-border px-2 py-2 ${bg}`}
        >
            <View className="flex-row items-center gap-2">
                <LineAccountName accountId={line.accountId} />
                <Text className="w-24 text-right text-sm text-foreground">
                    {amountText(line.debit, currency)}
                </Text>
                <Text className="w-24 text-right text-sm text-foreground">
                    {amountText(line.credit, currency)}
                </Text>
            </View>
            <LineMemo memo={line.memo} />
        </View>
    )
}

function LinesHeading() {
    const cell = 'text-xs font-semibold uppercase text-muted-foreground'
    return (
        <View className="flex-row items-center gap-2 border-b border-border px-2 py-1">
            <Text className={`min-w-0 flex-1 ${cell}`}>Account</Text>
            <Text className={`w-24 text-right ${cell}`}>Debit</Text>
            <Text className={`w-24 text-right ${cell}`}>Credit</Text>
        </View>
    )
}

function EntryFields({ detail, currency }: { detail: EntryDetail | null; currency: string }) {
    if (!detail) return null
    const lines = detail.lines.map(line => (
        <DrawerLine key={line.id} line={line} currency={currency} />
    ))
    return (
        <View className="gap-3">
            <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                <Field id="date" label="Date" value={formatDay(detail.date)} />
                <Field id="number" label="Number" value={entryNumberLabel(detail.number)} />
                <Field id="type" label="Type" value={detail.typeLabel} />
                <Field id="status" label="Status" value={detail.statusLabel} />
            </View>
            <Field id="memo" label="Memo" value={detail.memo} />
            <View>
                <LinesHeading />
                {lines}
            </View>
        </View>
    )
}

interface EntryDrawerProps extends Placement {
    detail: EntryDetail | null
    currency: string
    onClose: () => void
}

export function EntryDrawer({ detail, currency, onClose, ...placement }: EntryDrawerProps) {
    const closeColor = useThemeColor('foreground')
    const number = entryNumberLabel(detail?.number ?? '')
    return (
        <Drawer isOpen={detail !== null} onClose={onClose} {...placementProps(placement)}>
            <DrawerBackdrop testID="register-drawer-backdrop" />
            <DrawerContent
                testID="register-entry-drawer"
                role={isInline(placement) ? 'complementary' : 'dialog'}
                accessibilityLabel={`Entry ${number}`}
                className={contentClass(placement)}
            >
                <DrawerHeader className="border-b border-border">
                    <Text className="text-lg font-semibold text-foreground">{number}</Text>
                    <DrawerCloseButton
                        accessibilityLabel="Close"
                        testID="register-drawer-close"
                        style={{ minWidth: 44, minHeight: 44 }}
                    >
                        <X size={18} color={closeColor} />
                    </DrawerCloseButton>
                </DrawerHeader>
                <DrawerBody style={{ flexShrink: 1 }}>
                    <EntryFields detail={detail} currency={currency} />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
