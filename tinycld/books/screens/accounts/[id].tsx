import { useLocalSearchParams } from 'expo-router'
import { RegisterScreenView } from '../../components/register/RegisterScreenView'
import { useRegisterScreen } from '../../hooks/useRegisterScreen'

function RegisterScreen({ id }: { id: string }) {
    return <RegisterScreenView {...useRegisterScreen(id)} />
}

export default function AccountRegisterRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <RegisterScreen key={id} id={id} />
}
