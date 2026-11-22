import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { statementEndingText } from '../../lib/reconcile'
import { StatusBadge } from '../StatusBadge'

// "Reconcile", back to the accounts screen (useReconcileScreen's onBack).
function BackLink({ onBack }: { onBack: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="reconcile-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Reconcile</Text>
        </Pressable>
    )
}

function ReconciledBadge({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <StatusBadge label="Reconciled" tone="success" testID="reconcile-status" />
}

// The account and "Statement ending Oct 31, 2026"; a finished reconciliation has the
// "Reconciled" badge beside the account.
function TitleBlock({ model }: { model: ReconcileScreenModel }) {
    const { reconciliation } = model
    if (!reconciliation) return null
    const isFinished = model.state === 'finished'
    return (
        <View testID="reconcile-title" className="min-w-0 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-2">
                <Text numberOfLines={1} className="shrink text-2xl font-semibold text-foreground">
                    {model.accountLabel}
                </Text>
                <ReconciledBadge isVisible={isFinished} />
            </View>
            <Text className="text-xs text-muted-foreground">
                {statementEndingText(reconciliation.statement_date)}
            </Text>
        </View>
    )
}

/**
 * The work screen's header (reconcile spec §3 "Header"): the back link, which every state
 * keeps, then the account and the statement line once the reconciliation is loaded. The
 * header's actions (Edit info, Finish later, Finish, More) are checkpoint 4's.
 */
export function ReconcileHeader({ model }: { model: ReconcileScreenModel }) {
    return (
        <View className="gap-1">
            <BackLink onBack={model.onBack} />
            <TitleBlock model={model} />
        </View>
    )
}
