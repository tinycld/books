import { useLocalSearchParams } from 'expo-router'
import { WriteOffScreen } from '../../components/write-offs/WriteOffScreen'

// A write-off is posted when it is made, so its route only shows it.
export default function WriteOffRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <WriteOffScreen key={id} id={id ?? ''} />
}
