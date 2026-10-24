import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { EntryBackLink } from '../../components/entries/EntryHeader'
import { EntryReadOnlyView } from '../../components/entries/EntryReadOnlyView'
import { useEntryDetail } from '../../hooks/useEntryDetail'

function NotFound() {
    return (
        <View testID="entry-not-found" className="flex-1 gap-2 bg-background px-4 pt-2">
            <EntryBackLink />
            <Text className="text-base text-foreground">This entry does not exist</Text>
        </View>
    )
}

function EntryScreen({ id }: { id: string }) {
    const detail = useEntryDetail(id)
    if (detail.viewState === 'loading') return <LoadingState />
    if (detail.viewState === 'not-found') return <NotFound />
    return <EntryReadOnlyView detail={detail} />
}

export default function EntryRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <EntryScreen key={id} id={id} />
}
