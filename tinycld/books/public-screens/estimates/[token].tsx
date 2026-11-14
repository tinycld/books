import { useLocalSearchParams } from 'expo-router'
import { EstimatePublicScreen } from '../../components/estimate-public/EstimatePublicScreen'

// /p/books/estimates/<token>: the customer's estimate page, signed out.
export default function PublicEstimateRoute() {
    const { token } = useLocalSearchParams<{ token: string }>()
    const value = typeof token === 'string' ? token : ''
    return <EstimatePublicScreen token={value} />
}
