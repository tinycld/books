import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Dialog } from '@tinycld/core/ui/dialog'
import {
    type Control,
    type FieldValues,
    FormErrorSummary,
    type Path,
    SelectInput,
    TextInput,
} from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import type { UseFormReturn } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import { useBankDetailsForm, useConnectAccountForm } from '../../hooks/useConnectAccountForm'
import { useConnectableAccounts } from '../../hooks/useConnectableAccounts'
import {
    CONNECT_EMPTY_TEXT,
    type ConnectionFormValues,
    connectionLabel,
} from '../../lib/bank-connections'
import { rootErrorOnly } from '../../lib/root-errors'
import { DialogSubmitKey } from './DialogSubmitKey'

interface ConnectAccountDialogProps {
    mode: 'connect' | 'edit'
    connection?: BankConnectionRow
    connectedAccountIds: ReadonlySet<string>
    isWide: boolean
    onConnected(id: string): void
    onClose(): void
}

function ignore() {}

const DETAIL_NAMES = { institution: 'institution', mask: 'account_mask' } as const

// Both forms carry the bank details, so one field block serves both; the test ids follow
// the dialog (`bank-connect-*` or `bank-details-*`).
function BankDetailFields<T extends FieldValues>({
    control,
    names,
    idPrefix,
    autoFocus,
}: {
    control: Control<T>
    names: { institution: Path<T>; mask: Path<T> }
    idPrefix: string
    autoFocus: boolean
}) {
    return (
        <>
            <TextInput
                control={control}
                name={names.institution}
                label="Bank name"
                hint="As it appears on your statement"
                autoFocus={autoFocus}
                testID={`${idPrefix}-institution`}
            />
            <TextInput
                control={control}
                name={names.mask}
                label="Last 4 digits"
                hint="Helps you tell accounts at the same bank apart"
                keyboardType="number-pad"
                testID={`${idPrefix}-mask`}
            />
        </>
    )
}

function RootErrors<T extends FieldValues>({
    form,
    testID,
}: {
    form: UseFormReturn<T>
    testID: string
}) {
    const { errors, isSubmitted } = form.formState
    return (
        <FormErrorSummary
            testID={testID}
            errors={rootErrorOnly(errors)}
            showFieldNames={false}
            isEnabled={isSubmitted}
        />
    )
}

function NoAccountToConnect({
    reason,
    onClose,
}: {
    reason: keyof typeof CONNECT_EMPTY_TEXT
    onClose(): void
}) {
    const orgHref = useOrgHref()
    const openChart = () => {
        onClose()
        router.push(orgHref('books/accounts'))
    }
    return (
        <View className="gap-3">
            <Text testID="bank-connect-none" className="text-sm text-foreground">
                {CONNECT_EMPTY_TEXT[reason]}
            </Text>
            <Pressable
                testID="bank-connect-open-chart"
                accessibilityRole="link"
                onPress={openChart}
                className="self-start justify-center"
                style={{ minHeight: 44 }}
            >
                <Text className="text-sm font-medium text-primary">Open Chart of Accounts</Text>
            </Pressable>
        </View>
    )
}

function ConnectBody({
    connectedAccountIds,
    isWide,
    onConnected,
    onClose,
}: Omit<ConnectAccountDialogProps, 'mode' | 'connection'>) {
    const { form, submit, isPending } = useConnectAccountForm({ onConnected })
    const connectable = useConnectableAccounts(connectedAccountIds)
    const writes = useServerActionState()
    const canPick = connectable.isReady && connectable.emptyReason === null
    // ⌘↵ takes a press exactly when the Connect button does (core's action button also
    // disables itself while writes are unavailable).
    const canSubmitKey = !isPending && canPick && !writes.isDisabled
    return (
        <Dialog
            isOpen
            onClose={isPending ? ignore : onClose}
            title="Connect a bank account"
            size="md"
            testID="bank-connect-dialog"
        >
            <Dialog.Body>
                <DialogSubmitKey description="Connect" isEnabled={canSubmitKey} onSubmit={submit} />
                <View className="gap-4">
                    <ConnectAccountFields
                        control={form.control}
                        connectable={connectable}
                        autoFocus={isWide}
                        onClose={onClose}
                    />
                    <RootErrors form={form} testID="bank-connect-errors" />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={isPending}
                    testID="bank-connect-cancel"
                />
                <Dialog.ActionButton
                    label="Connect"
                    onPress={submit}
                    isDisabled={isPending || !canPick}
                    testID="bank-connect-submit"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

function ChartLoadError({ onRetry }: { onRetry(): void }) {
    return (
        <View className="gap-3">
            <Text
                testID="bank-connect-load-error"
                accessibilityRole="alert"
                className="text-sm text-danger"
            >
                Books could not load your accounts.
            </Text>
            <Button
                testID="bank-connect-retry"
                variant="outline"
                className="self-start"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Try again</ButtonText>
            </Button>
        </View>
    )
}

// The picker and the bank details, or why there is nothing to pick yet. The bank details
// show only with the picker, because without an account there is nothing to describe.
function ConnectAccountFields({
    control,
    connectable,
    autoFocus,
    onClose,
}: {
    control: Control<ConnectionFormValues>
    connectable: ReturnType<typeof useConnectableAccounts>
    autoFocus: boolean
    onClose(): void
}) {
    const { options, emptyReason, isReady, isError, retry } = connectable
    if (isError) return <ChartLoadError onRetry={retry} />
    if (!isReady) {
        return (
            <View testID="bank-connect-loading">
                <LoadingState />
            </View>
        )
    }
    if (emptyReason) return <NoAccountToConnect reason={emptyReason} onClose={onClose} />
    return (
        <>
            <SelectInput
                control={control}
                name="account"
                label="Account"
                options={options}
                placeholder="Choose an account"
                autoFocus={autoFocus}
                testID="bank-connect-account"
            />
            <BankDetailFields
                control={control}
                names={DETAIL_NAMES}
                idPrefix="bank-connect"
                autoFocus={false}
            />
        </>
    )
}

function DetailsBody({
    connection,
    isWide,
    onClose,
}: {
    connection: BankConnectionRow
    isWide: boolean
    onClose(): void
}) {
    const { form, submit, isPending } = useBankDetailsForm({ connection, onClose })
    const writes = useServerActionState()
    const label = connectionLabel(connection.accountNumber, connection.accountName)
    const canSubmitKey = !isPending && !writes.isDisabled
    return (
        <Dialog
            isOpen
            onClose={isPending ? ignore : onClose}
            title={`Bank details for ${label}`}
            size="md"
            testID="bank-details-dialog"
        >
            <Dialog.Body>
                <DialogSubmitKey description="Save" isEnabled={canSubmitKey} onSubmit={submit} />
                <View className="gap-4">
                    <BankDetailFields
                        control={form.control}
                        names={DETAIL_NAMES}
                        idPrefix="bank-details"
                        autoFocus={isWide}
                    />
                    <RootErrors form={form} testID="bank-details-errors" />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={isPending}
                    testID="bank-details-cancel"
                />
                <Dialog.ActionButton
                    label="Save"
                    onPress={submit}
                    isDisabled={isPending}
                    testID="bank-details-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

// Connect picks the account and its bank details; Edit changes the bank details only,
// because the account of a connection never changes (disconnect and connect instead).
export function ConnectAccountDialog({
    mode,
    connection,
    connectedAccountIds,
    isWide,
    onConnected,
    onClose,
}: ConnectAccountDialogProps) {
    if (mode === 'edit') {
        if (!connection) return null
        return <DetailsBody connection={connection} isWide={isWide} onClose={onClose} />
    }
    return (
        <ConnectBody
            connectedAccountIds={connectedAccountIds}
            isWide={isWide}
            onConnected={onConnected}
            onClose={onClose}
        />
    )
}
