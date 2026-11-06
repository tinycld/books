import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { liabilityAccountOptions, newSalesTaxAccount } from '../lib/liability-accounts'
import { recordRefusalHandler } from '../lib/record-refusals'
import { writeRefusalText } from '../lib/refusal'
import { type AgencyValues, agencySchema } from '../lib/tax-schemas'
import { agencyFormDefaults, agencyPatch } from '../lib/tax-writes'
import { useTaxesStore } from '../stores/taxes-store'
import type { BooksTaxAgencies } from '../types'
import { useFormAccounts } from './useFormAccounts'

// The agency a save changes: null for an add.
type StoredAgency = BooksTaxAgencies | null

// The Add agency / Edit agency dialog: its form, the liability account picker, the
// one-tap Sales tax payable account, and the save.
export function useAgencyDialog(id: string | null) {
    const [agenciesCollection, accountsCollection] = useStore(
        'books_tax_agencies',
        'books_accounts'
    )
    // The edited agency through the dialog's own query, not core useRecord, which has no
    // error state: a refused load shows its error and Retry.
    const storedQuery = useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ agency: agenciesCollection })
                      .where(({ agency }) => eq(agency.id, id))
                      .findOne()
                : null,
        queryKey: ['books.taxes.dialog.agency', id ?? ''],
    })
    const stored = storedQuery.data
    const chart = useFormAccounts()
    const closeDialog = useTaxesStore(s => s.closeDialog)

    // The chart and an edited agency load after the dialog opens: the form takes their
    // values when they arrive, and keeps what the user already changed.
    const values = agencyFormDefaults(stored, chart.accounts)
    const form = useForm<AgencyValues>({
        resolver: zodResolver(agencySchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })

    const storedAccount = stored?.account ?? ''
    const accountChoices = liabilityAccountOptions(chart.accounts, storedAccount)
    const keepsStoredAccount = chart.accounts.some(account => account.id === storedAccount)
    // Until the chart loads the select stays, so the one-tap create is never offered
    // for a chart that has the account.
    const hasLiabilityAccount =
        !chart.isReady || accountChoices.options.length > 0 || keepsStoredAccount

    const createAccountMutation = useMutation({
        mutationFn: function* (accountId: string) {
            // The columns a new top-level account gets from the account form.
            yield accountsCollection.insert({
                id: accountId,
                ...newSalesTaxAccount(chart.accounts),
                parent: '',
                description: '',
                form_1099_box: '',
                inactive: false,
            })
        },
        // A refusal of an earlier try, and a Save's "Choose a liability account.", no
        // longer hold once the account exists.
        onSuccess: (_data, accountId) => {
            form.clearErrors('root')
            form.setValue('account', accountId, { shouldDirty: true, shouldValidate: true })
        },
        onError: error => {
            form.setError('root', { type: 'server', message: writeRefusalText(error) })
        },
    })

    const saveMutation = useMutation({
        mutationFn: function* ({ saved, stored }: { saved: AgencyValues; stored: StoredAgency }) {
            if (stored === null) {
                yield agenciesCollection.insert({
                    id: newRecordId(),
                    name: saved.name,
                    account: saved.account,
                    inactive: false,
                })
                return
            }
            const patch = agencyPatch(stored, saved)
            if (Object.keys(patch).length === 0) return
            yield agenciesCollection.update(stored.id, draft => {
                Object.assign(draft, patch)
            })
        },
        onSuccess: () => closeDialog(),
        onError: recordRefusalHandler(
            form,
            handleMutationErrorsWithForm({ setError: form.setError, getValues: form.getValues })
        ),
    })

    const createAccount = async () => {
        try {
            await createAccountMutation.mutateAsync(newRecordId())
        } catch {
            // onError has put the refusal on the form root.
        }
    }

    // An edit whose record has not loaded has nothing to save against: a save then would
    // write nothing and close the dialog on the user's changes.
    const target: StoredAgency | undefined = id === null ? null : stored
    const loadFailed = chart.isError || storedQuery.isError
    // Until the chart and the edited agency load, the form does not hold what a save
    // would send.
    const isLoading = !chart.isReady || !storedQuery.isReady
    const canSave = target !== undefined && !loadFailed && !isLoading && !saveMutation.isPending

    const submit = () => {
        if (!canSave) return
        void form.handleSubmit(saved => saveMutation.mutate({ saved, stored: target }))()
    }

    // A failed live query does not recover on a reload of its collection; only a failed
    // query is restarted, so a loaded one keeps its rows. The chart and the agency read
    // different collections, so the two can restart side by side.
    const retryLoad = () => {
        if (chart.isError) chart.retry()
        if (!storedQuery.isError) return
        void recoverLiveQueries({
            queries: [storedQuery.collection],
            sources: [agenciesCollection],
            onError: err => log.error('books.taxes.dialog.agency', err),
        })
    }

    return {
        form,
        title: id === null ? 'Add agency' : 'Edit agency',
        saveLabel: id === null ? 'Add agency' : 'Save changes',
        accountOptions: accountChoices.options,
        accountTriggerLabel: accountChoices.triggerLabel,
        hasLiabilityAccount,
        createAccount,
        isCreatingAccount: createAccountMutation.isPending,
        // A refused account create shows in the summary before any Save.
        summaryEnabled: form.formState.isSubmitted || createAccountMutation.isError,
        submit,
        isSaving: saveMutation.isPending,
        canSave,
        loadFailed,
        retryLoad,
        close: closeDialog,
    }
}
