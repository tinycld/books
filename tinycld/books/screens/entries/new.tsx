import { useLiveQuery } from '@tanstack/react-db'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { EntryForm } from '../../components/entries/EntryForm'
import { EntryBackLink, EntryHeader } from '../../components/entries/EntryHeader'
import { EntryStatusBadge } from '../../components/entries/EntryStatusBadge'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import { newEntryDefaults } from '../../lib/entry-schema'
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

export default function NewEntryRoute() {
    const access = useBooksAccess()
    if (!access.isReady) return <LoadingState />
    if (!access.canWrite) return <NoAccess />
    return <NewEntryScreen />
}
