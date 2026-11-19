import { Text, View } from 'react-native'

interface DocumentInlineNoticeProps {
    testID: string
    message: string
}

/**
 * A short notice inside a document form (a payout's "This refund pays out a credit. …"
 * under its link row): a bordered box of muted text. DocumentNotice is the full-screen
 * notice that stands in for a form.
 */
export function DocumentInlineNotice({ testID, message }: DocumentInlineNoticeProps) {
    return (
        <View testID={testID} className="rounded-lg border border-border bg-background px-3 py-2">
            <Text className="text-sm text-muted-foreground">{message}</Text>
        </View>
    )
}
