import { useLiveQuery } from '@tanstack/react-db'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { Text, View } from 'react-native'
import { EntryForm } from '../../components/entries/EntryForm'
import { EntryBackLink, EntryHeader } from '../../components/entries/EntryHeader'
import { EntryStatusBadge } from '../../components/entries/EntryStatusBadge'
import { useBooksAccess } from '../../hooks/useBooksAccess'
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

function NewEntryScreen() {
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
