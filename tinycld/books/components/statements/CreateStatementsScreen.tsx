import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCreateStatementsForm } from '../../hooks/useCreateStatementsForm'
import { FORM_KEYS } from '../../lib/entry-shortcuts'
import { rootErrorOnly } from '../../lib/root-errors'
import { createScreenMode } from '../../lib/statement-texts'
import { useStatementsStore } from '../../stores/statements-store'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryNotice } from '../entries/EntryNotice'
import { StatementActionBar, type StatementBarButton } from './StatementActionBar'
import { StatementOptions } from './StatementOptions'
import { StatementPreviewDialog } from './StatementPreviewDialog'
import { StatementRecipients } from './StatementRecipients'
import { StatementRunNotice } from './StatementRunNotice'
import { StatementTotal } from './StatementTotal'

const TAP = { minHeight: 44 }
const TITLE = 'Create statements'
const NO_WRITE_TEXT = 'You need bookkeeper access to create statements'
const DISCARD_TITLE = 'Discard this run?'
const TICK_BOX = { all: 'checked', some: 'mixed', none: 'empty' } as const

// The bar's keys (spec §3.4; lib/entry-shortcuts.ts): module constants, so each button's
// registration stays put across renders.
const BAR_KEY = { scope: 'compose', allowInInputs: true, group: 'Statements' } as const
const CANCEL_KEY = { keys: FORM_KEYS.cancel, ...BAR_KEY }
const PREVIEW_KEY = { keys: 'Alt+p', ...BAR_KEY }
const SAVE_KEY = { keys: FORM_KEYS.saveDraft, ...BAR_KEY }
const SEND_KEY = { keys: FORM_KEYS.post, ...BAR_KEY }

function BackLink({ onPress }: { onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="statements-back"
            accessibilityRole="link"
            onPress={onPress}
            className="flex-row items-center gap-1 self-start"
            style={TAP}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Back</Text>
        </Pressable>
    )
}

/**
 * In place of the form (spec §3.9), the Books notice (EntryNotice): while the access loads,
 * when it could not load (with Retry), and for a user who cannot write (no-write notice).
 */
function StatementsNotice() {
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const leave = () => {
        if (router.canGoBack()) router.back()
        else router.replace(orgHref('books/customers'))
    }
    const retry = {
        testID: 'statements-retry',
        onPress: () => {
            void recoverLiveQueries({
                queries: [access.collection],
                onError: err => log.error('books.statements', err),
            })
        },
    }
    const message = noticeText({ isError: access.isError, isReady: access.isReady })
    const back = <BackLink onPress={leave} />
    const retryWhenFailed = access.isError ? retry : undefined
    return (
        <EntryNotice
            testID="statements-message"
            title={TITLE}
            message={message}
            back={back}
            retry={retryWhenFailed}
        />
    )
}

function noticeText(input: { isError: boolean; isReady: boolean }): string {
    if (input.isError) return 'Your access could not load.'
    if (!input.isReady) return 'Loading…'
    return NO_WRITE_TEXT
}

type StatementsForm = ReturnType<typeof useCreateStatementsForm>

// Cancel (Esc), Preview (⌥P), Save (⌘S), Save and send (⌘↵, the primary), in Tab order.
function barActionsOf(screen: StatementsForm, onCancel: () => void): StatementBarButton[] {
    const { bar } = screen
    return [
        {
            id: 'cancel',
            label: bar.cancel.label,
            shortcut: CANCEL_KEY,
            variant: 'outline',
            isServerAction: false,
            isDisabled: bar.cancel.isDisabled,
            onPress: onCancel,
        },
        {
            id: 'preview',
            label: bar.preview.label,
            shortcut: PREVIEW_KEY,
            variant: 'outline',
            isServerAction: true,
            isDisabled: bar.preview.isDisabled,
            onPress: screen.onPreview,
        },
        {
            id: 'save',
            label: bar.save.label,
            shortcut: SAVE_KEY,
            variant: 'outline',
            isServerAction: true,
            isDisabled: bar.save.isDisabled,
            onPress: screen.onSave,
        },
        {
            id: 'send',
            label: bar.send.label,
            shortcut: SEND_KEY,
            variant: 'primary',
            isServerAction: true,
            isDisabled: bar.send.isDisabled,
            onPress: screen.onSaveAndSend,
        },
    ]
}

function StatementsHeader({ screen }: { screen: StatementsForm }) {
    const isPhone = useBreakpoint() === 'mobile'
    const layout = isPhone ? 'gap-2' : 'flex-row items-start justify-between gap-4'
    return (
        <View className={layout}>
            <Text testID="statements-title" className="text-xl font-semibold text-foreground">
                {TITLE}
            </Text>
            <StatementTotal
                count={screen.tickedCount}
                total={screen.total}
                currency={screen.currency}
            />
        </View>
    )
}

interface StatementsFormProps {
    customer: string | undefined
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * The form of Create statements (spec §3.2-§3.4): Back, the title with the total, the
 * options, a refusal of the whole request in FormErrorSummary, the notice of a run of which
 * a part failed, the windowed list of customers, and the bar (Cancel, Preview, Save, Save and
 * send), with the Preview dialog and the Discard dialog of the leave guard.
 */
function CreateStatementsForm({ customer, canWrite, scopeOwner }: StatementsFormProps) {
    const screen = useCreateStatementsForm({ customer, canWrite })
    const outcome = useStatementsStore(state => state.outcome)
    const cancel = screen.leaveGuard.cancel
    const actions = barActionsOf(screen, cancel)
    const summaryErrors = rootErrorOnly(screen.errors)
    const tickAll = TICK_BOX[screen.tickAll]
    return (
        <View testID="statements-create" className="min-w-0 flex-1 bg-background">
            <View className="gap-4 px-4 pt-2 pb-4">
                <BackLink onPress={cancel} />
                <StatementsHeader screen={screen} />
                <StatementOptions
                    control={screen.control}
                    hasPeriod={screen.hasPeriod}
                    isDisabled={screen.isHeld}
                    onStatementDateChange={screen.onStatementDateChange}
                    onEndDateChange={screen.onEndDateChange}
                />
                <FormErrorSummary
                    errors={summaryErrors}
                    title={null}
                    variant="destructive"
                    showFieldNames={false}
                    testID="statements-error-summary"
                    isEnabled
                />
                <StatementRunNotice outcome={outcome} />
            </View>
            <View className="min-h-0 flex-1 px-4">
                <StatementRecipients
                    state={screen.listState}
                    filter={screen.balanceFilter}
                    entries={screen.entries}
                    currency={screen.currency}
                    isDisabled={screen.isHeld}
                    tickAll={tickAll}
                    scrollToIndex={screen.scrollToIndex}
                    scrollHandle={screen.listScroll}
                    onToggle={screen.onToggle}
                    onToggleAll={screen.onToggleAll}
                    onEmailChange={screen.onEmailChange}
                    onRetry={screen.retry}
                />
            </View>
            <StatementActionBar
                actions={actions}
                note={screen.bar.note}
                isMoreDisabled={screen.bar.cancel.isDisabled}
                scopeOwner={scopeOwner}
            />
            <StatementPreviewDialog preview={screen.preview} />
            <DiscardDialog title={DISCARD_TITLE} {...screen.leaveGuard.dialog} />
        </View>
    )
}

function StatementsSurface({ customer, scopeOwner }: Omit<StatementsFormProps, 'canWrite'>) {
    const access = useBooksAccess()
    const mode = createScreenMode({ canWrite: access.canWrite, accessLoading: !access.isReady })
    if (mode === 'notice') return <StatementsNotice />
    return (
        <CreateStatementsForm
            customer={customer}
            canWrite={access.canWrite}
            scopeOwner={scopeOwner}
        />
    )
}

/**
 * Create statements at `books/statements/new` (statements spec §3): the screen's `compose`
 * scope holds the bar's keys. `?customer=<id>` opens it with Customer balance "All", only
 * that customer ticked and the list scrolled to it.
 */
export function CreateStatementsScreen({ customer }: { customer?: string }) {
    const scopeOwner = useShortcutScope('compose')
    return (
        <ScopeProvider owner={scopeOwner}>
            <View pointerEvents="auto" className="flex-1 bg-background">
                <StatementsSurface customer={customer} scopeOwner={scopeOwner} />
            </View>
        </ScopeProvider>
    )
}
