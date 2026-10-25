import { Avatar } from '@tinycld/core/components/Avatar'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { OverrideRow as OverrideRowData } from '../../hooks/useCloseOverrides'
import { formatExpiry, parseExpiry } from '../../lib/overrides'
import { formatDay } from '../../lib/register-range'

interface OverrideRowProps {
    row: OverrideRowData
    isActive: boolean
    onRevoke?: (row: OverrideRowData) => void
}

function endedDay(expiresAt: string) {
    const ended = new Date(parseExpiry(expiresAt))
    const month = String(ended.getMonth() + 1).padStart(2, '0')
    const date = String(ended.getDate()).padStart(2, '0')
    return formatDay(`${ended.getFullYear()}-${month}-${date}`)
}

function RevokeButton({
    isVisible,
    row,
    onRevoke,
}: {
    isVisible: boolean
    row: OverrideRowData
    onRevoke?: (row: OverrideRowData) => void
}) {
    if (!isVisible) return null
    return (
        <Button
            variant="outline"
            size="sm"
            testID={`books-settings-revoke-${row.id}`}
            onPress={event => {
                // A press must not reach a parent row's handler.
                event?.stopPropagation?.()
                onRevoke?.(row)
            }}
        >
            <ButtonText>Revoke</ButtonText>
        </Button>
    )
}

export function OverrideRow({ row, isActive, onRevoke }: OverrideRowProps) {
    const name = row.userName ?? 'Unknown person'
    const when = isActive
        ? `Expires ${formatExpiry(row.expires_at)}`
        : `Ended ${endedDay(row.expires_at)}`
    return (
        <View
            className="flex-row items-center gap-3 border-b border-border py-3"
            testID={`books-settings-override-${row.id}`}
        >
            <Avatar name={name} colorKey={row.user} size={32} />
            <View className="flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-foreground">{name}</Text>
                <Text className="text-xs text-foreground">{row.reason}</Text>
                <Text className="text-xs text-muted-foreground">
                    {when} · Granted by {row.grantedByName ?? 'Unknown person'}
                </Text>
            </View>
            <RevokeButton isVisible={isActive} row={row} onRevoke={onRevoke} />
        </View>
    )
}
