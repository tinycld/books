import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { materialize } from 'pbtsdb'
import { newRecordId } from 'pbtsdb/core'
import { recordRefusalHandler } from '../lib/record-refusals'
import { groupComponentOptions } from '../lib/tax-rate-options'
import { type GroupValues, groupSchema } from '../lib/tax-schemas'
import { groupFormDefaults, groupLine, groupPatch } from '../lib/tax-writes'
import { useTaxesStore } from '../stores/taxes-store'
import type { BooksTaxRates } from '../types'
import { useBooksSettings } from './useBooksSettings'

// The group a save changes: null for an add.
type StoredGroup = BooksTaxRates | null

// The Add group / Edit group dialog: its form, the rate checklist, the combined-rate
// line and the save.
export function useGroupDialog(id: string | null) {
    const [ratesCollection, agenciesCollection] = useStore('books_tax_rates', 'books_tax_agencies')
    // The edited group through the dialog's own query, not core useRecord, which has no
    // error state: a refused load shows its error and Retry.
    const storedQuery = useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ group: ratesCollection })
                      .where(({ group }) => eq(group.id, id))
                      .findOne()
                : null,
        queryKey: ['books.taxes.dialog.group', id ?? ''],
    })
    const stored = storedQuery.data
    // Every agency with its rates (inactive ones too: an edit's combined line counts a
    // stored inactive rate), so each rate's label has its agency in one query.
    const agencyRatesQuery = useLiveQuery({
        query: q =>
            q.from({ agency: agenciesCollection }).select(({ agency }) => ({
                ...agency,
                rates: materialize(
                    q
                        .from({ rate: ratesCollection })
                        .where(({ rate }) => and(eq(rate.agency, agency.id), eq(rate.type, 'rate')))
                ),
            })),
        queryKey: ['books.taxes.dialog.agency-rates'],
    })
    const { settings } = useBooksSettings()
    const closeDialog = useTaxesStore(s => s.closeDialog)
    const agencies = agencyRatesQuery.data ?? []
    const rates = agencies.flatMap(agency => agency.rates ?? [])

    // An edited group loads after the dialog opens: the form takes its values when they
    // arrive, and keeps what the user already changed.
    const values = groupFormDefaults(stored)
    const form = useForm<GroupValues>({
        resolver: zodResolver(groupSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    const checked = useWatch({ control: form.control, name: 'components' })
    const ppmById = new Map(rates.map(rate => [rate.id, rate.rate_ppm]))
    const checkedPpms = checked.flatMap(rateId => {
        const ppm = ppmById.get(rateId)
        return ppm === undefined ? [] : [ppm]
    })

    const saveMutation = useMutation({
        mutationFn: function* ({ saved, stored }: { saved: GroupValues; stored: StoredGroup }) {
            if (stored === null) {
                yield ratesCollection.insert({
                    id: newRecordId(),
                    type: 'group',
                    name: saved.name,
                    rate_ppm: 0,
                    agency: '',
                    components: saved.components,
                    is_default: false,
                    inactive: false,
                })
                return
            }
            const patch = groupPatch(stored, saved)
            if (Object.keys(patch).length === 0) return
            yield ratesCollection.update(stored.id, draft => {
                Object.assign(draft, patch)
            })
        },
        onSuccess: () => closeDialog(),
        // A `components` refusal lands under the checklist; a message-only one in the
        // summary.
        onError: recordRefusalHandler(
            form,
            handleMutationErrorsWithForm({ setError: form.setError, getValues: form.getValues })
        ),
    })

    // An edit whose record has not loaded has nothing to save against: a save then would
    // write nothing and close the dialog on the user's changes.
    const target: StoredGroup | undefined = id === null ? null : stored
    const loadFailed = agencyRatesQuery.isError || storedQuery.isError
    // Until the rates and the edited group load, the checklist is not the one a save
    // would check against.
    const isLoading = !agencyRatesQuery.isReady || !storedQuery.isReady
    const canSave = target !== undefined && !loadFailed && !isLoading && !saveMutation.isPending

    const submit = () => {
        if (!canSave) return
        void form.handleSubmit(saved => saveMutation.mutate({ saved, stored: target }))()
    }

    // A failed live query does not recover on a reload of its collection; only a failed
    // query is restarted, so a loaded one keeps its rows. A source is cleaned only when it
    // failed itself, so the page's rows stay. Both queries read the rates collection, so
    // they restart one after the other: two restarts at once could both clean it.
    const retryLoad = () => {
        const restart = async () => {
            if (storedQuery.isError) {
                await recoverLiveQueries({
                    queries: [storedQuery.collection],
                    sources: [ratesCollection],
                    onError: err => log.error('books.taxes.dialog.group', err),
                })
            }
            if (agencyRatesQuery.isError) {
                await recoverLiveQueries({
                    queries: [agencyRatesQuery.collection],
                    sources: [agenciesCollection, ratesCollection],
                    onError: err => log.error('books.taxes.dialog.agency-rates', err),
                })
            }
        }
        void restart()
    }

    // A checked rate that turns inactive while the dialog is open stays listed, so it can
    // be unchecked.
    const keptIds = [...(stored?.components ?? []), ...checked]

    return {
        form,
        title: id === null ? 'Add group' : 'Edit group',
        saveLabel: id === null ? 'Add group' : 'Save changes',
        options: groupComponentOptions(rates, agencies, keptIds),
        combined: groupLine(checkedPpms, settings?.currency ?? 'USD'),
        summaryEnabled: form.formState.isSubmitted,
        submit,
        isSaving: saveMutation.isPending,
        canSave,
        loadFailed,
        retryLoad,
        close: closeDialog,
    }
}
