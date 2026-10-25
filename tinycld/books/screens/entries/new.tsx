import { useLiveQuery } from '@tanstack/react-db'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { EntryForm } from '../../components/entries/EntryForm'
import { EntryBackLink, EntryHeader } from '../../components/entries/EntryHeader'
import { EntryStatusBadge } from '../../components/entries/EntryStatusBadge'
import { ReplaceHeader } from '../../components/entries/ReplaceHeader'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useEntryDetail } from '../../hooks/useEntryDetail'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import { type EntryFormValues, newEntryDefaults } from '../../lib/entry-schema'
import { todayIso } from '../../lib/register-range'
import { warnOnce } from '../../lib/warn-once'

function NoAccess() {
    return (
        <View testID="entry-no-access" className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">
                You need bookkeeper access to create entries
            </Text>
        </View>
    )
}

function useAfterSave() {
    const orgHref = useOrgHref()
    // Replacing keeps the unsaved form out of the back stack; Post & new mounts a fresh form.
    return (id: string, outcome: SaveOutcome) => {
        const target = outcome === 'post-new' ? 'books/entries/new' : `books/entries/${id}`
        router.replace(orgHref(target))
    }
}

function NewEntryScreen() {
    const onSaved = useAfterSave()
    const { onBack } = useBackToEntries()
    const [settingsCollection] = useStore('books_settings')
    const { data, isReady } = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books.entry-form.settings'],
    })
    const settings = data?.[0]
    if (!isReady) return <LoadingState />
    if (!settings) warnOnce('settings-missing', 'books.entries', 'settings row missing', {})
    const currency = settings?.currency ?? 'USD'
    return (
        <EntryForm
            initial={newEntryDefaults(todayIso())}
            currency={currency}
            onSaved={onSaved}
            onCancel={onBack}
            header={totals => (
                <EntryHeader
                    title="New journal entry"
                    badge={<EntryStatusBadge status="draft" />}
                    bigTotal={totals.bigTotal}
                    isTooLarge={totals.isTooLarge}
                    currency={currency}
                />
            )}
        />
    )
}

function OriginalNotFound() {
    return (
        <View testID="entry-not-found" className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">This entry cannot be edited</Text>
        </View>
    )
}

interface HeldOriginal {
    number: string
    currency: string
    initial: EntryFormValues
}

// The original is voided by the post while this screen is still up, so what the form
// starts from is taken once; a later change to the original must not unmount it.
function ReplaceForm({ replaces }: { replaces: string }) {
    const detail = useEntryDetail(replaces)
    const onSaved = useAfterSave()
    const { onBack } = useBackToEntries()
    const [held, setHeld] = useState<HeldOriginal | null>(null)
    if (
        !held &&
        detail.viewState === 'ready' &&
        detail.entry.status === 'posted' &&
        detail.entry.origin !== 'void_reversal'
    ) {
        setHeld({
            number: detail.entry.number,
            currency: detail.currency,
            // A blank id makes each copied line an insert on the new draft.
            initial: {
                ...detail.initialValues,
                lines: detail.initialValues.lines.map(line => ({ ...line, id: '' })),
            },
        })
    }
    if (held) {
        return (
            <EntryForm
                key={replaces}
                initial={held.initial}
                currency={held.currency}
                replaces={replaces}
                journalNumber={held.number}
                onSaved={onSaved}
                onCancel={onBack}
                header={totals => (
                    <ReplaceHeader
                        originalNumber={held.number}
                        totals={totals}
                        currency={held.currency}
                    />
                )}
            />
        )
    }
    if (detail.viewState === 'loading') return <LoadingState />
    return <OriginalNotFound />
}

export default function NewEntryRoute() {
    const access = useBooksAccess()
    const { replaces } = useLocalSearchParams<{ replaces?: string }>()
    if (!access.isReady) return <LoadingState />
    if (!access.canWrite) return <NoAccess />
    if (replaces) return <ReplaceForm key={replaces} replaces={replaces} />
    return <NewEntryScreen />
}
