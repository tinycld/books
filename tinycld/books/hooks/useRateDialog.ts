import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { recordRefusalHandler } from '../lib/record-refusals'
import { parseRatePercent } from '../lib/sales-tax'
import { rateAgencyOptions } from '../lib/tax-rate-options'
import { type RateValues, rateSchema } from '../lib/tax-schemas'
import { rateFormDefaults, ratePatch, ratePreview } from '../lib/tax-writes'
import { useTaxesStore } from '../stores/taxes-store'
import type { BooksTaxRates } from '../types'
import { useBooksSettings } from './useBooksSettings'

// The rate a save changes: null for an add.
type StoredRate = BooksTaxRates | null

// The schema has already refused a rate that does not parse.
function ratePpm(text: string) {
    const ppm = parseRatePercent(text)
    if (ppm === null) throw new RangeError(`Rate "${text}" passed the schema but does not parse.`)
    return ppm
}

// The Add rate / Edit rate dialog: its form, the agency picker, the live tax line and
// the save. A new rate starts on `agencyId`, the agency card it was opened from.
export function useRateDialog(id: string | null, agencyId: string) {
    const [ratesCollection, agenciesCollection] = useStore('books_tax_rates', 'books_tax_agencies')
    // The edited rate through the dialog's own query, not core useRecord, which has no
    // error state: a refused load shows its error and Retry.
    const storedQuery = useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ rate: ratesCollection })
                      .where(({ rate }) => eq(rate.id, id))
                      .findOne()
                : null,
        queryKey: ['books.taxes.dialog.rate', id ?? ''],
    })
    const stored = storedQuery.data
    const agenciesQuery = useLiveQuery({
        query: q => q.from({ agency: agenciesCollection }),
        queryKey: ['books.taxes.dialog.agencies'],
    })
    const { settings } = useBooksSettings()
    const closeDialog = useTaxesStore(s => s.closeDialog)
    const agencies = agenciesQuery.data ?? []

    // A new rate on an agency that is not active (or no longer exists) would always be
    // refused, and the picker cannot show it: such an add starts with no agency. Until
    // the agencies load, the card's agency stands.
    const isActiveAgency = agencies.some(agency => agency.id === agencyId && !agency.inactive)
    const startAgency = agenciesQuery.isReady && !isActiveAgency ? '' : agencyId

    // An edited rate loads after the dialog opens: the form takes its values when they
    // arrive, and keeps what the user already changed.
    const values = rateFormDefaults(stored, startAgency)
    const form = useForm<RateValues>({
        resolver: zodResolver(rateSchema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })
    const rate = useWatch({ control: form.control, name: 'rate' })

    const saveMutation = useMutation({
        mutationFn: function* ({ saved, stored }: { saved: RateValues; stored: StoredRate }) {
            if (stored === null) {
                yield ratesCollection.insert({
                    id: newRecordId(),
                    type: 'rate',
                    name: saved.name,
                    rate_ppm: ratePpm(saved.rate),
                    agency: saved.agency,
                    components: [],
                    is_default: false,
                    inactive: false,
                })
                return
            }
            const patch = ratePatch(stored, saved)
            if (Object.keys(patch).length === 0) return
            yield ratesCollection.update(stored.id, draft => {
                Object.assign(draft, patch)
            })
        },
        onSuccess: () => closeDialog(),
        onError: recordRefusalHandler(
            form,
            handleMutationErrorsWithForm({ setError: form.setError, getValues: form.getValues })
        ),
    })

    // An edit whose record has not loaded has nothing to save against: a save then would
    // write nothing and close the dialog on the user's changes.
    const target: StoredRate | undefined = id === null ? null : stored
    const loadFailed = agenciesQuery.isError || storedQuery.isError
    // Until the agencies and the edited rate load, the form does not hold what a save
    // would send.
    const isLoading = !agenciesQuery.isReady || !storedQuery.isReady
    const canSave = target !== undefined && !loadFailed && !isLoading && !saveMutation.isPending

    const submit = () => {
        if (!canSave) return
        void form.handleSubmit(saved => saveMutation.mutate({ saved, stored: target }))()
    }

    // A failed live query does not recover on a reload of its collection; only a failed
    // query is restarted, so a loaded one keeps its rows. A source is cleaned only when it
    // failed itself, so the page's rows stay. The two queries read different
    // collections, so they can restart side by side.
    const retryLoad = () => {
        if (agenciesQuery.isError) {
            void recoverLiveQueries({
                queries: [agenciesQuery.collection],
                sources: [agenciesCollection],
                onError: err => log.error('books.taxes.dialog.agencies', err),
            })
        }
        if (storedQuery.isError) {
            void recoverLiveQueries({
                queries: [storedQuery.collection],
                sources: [ratesCollection],
                onError: err => log.error('books.taxes.dialog.rate', err),
            })
        }
    }

    return {
        form,
        title: id === null ? 'Add rate' : 'Edit rate',
        saveLabel: id === null ? 'Add rate' : 'Save changes',
        agencyOptions: rateAgencyOptions(agencies, stored?.agency ?? ''),
        preview: ratePreview(rate, settings?.currency ?? 'USD'),
        summaryEnabled: form.formState.isSubmitted,
        submit,
        isSaving: saveMutation.isPending,
        canSave,
        loadFailed,
        retryLoad,
        close: closeDialog,
    }
}
