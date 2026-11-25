import { useLocalSearchParams } from 'expo-router'
import { WriteOffScreen } from '../../components/write-offs/WriteOffScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// A write-off is posted when it is made, so its route only shows it.
export default function WriteOffRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useDocumentRouteId('books_write_offs', key)
    if (id === undefined) return null
    return <WriteOffScreen key={id} id={id} />
}
