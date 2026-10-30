import { useFocusEffect, useNavigation } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useCallback } from 'react'

/**
 * The bare `/a/books` lands on the Lists hub. The move replaces this screen in
 * Books' own stack instead of using a global `<Redirect>`: since expo-router 58
 * a router call is queued and runs after the next effects, so a `<Redirect>`
 * could land after the user had already moved to another package and pull them
 * back into Books. A stack action changes only Books' own history, never which
 * package is shown.
 */
export default function BooksIndex() {
    const navigation = useNavigation()
    useFocusEffect(
        useCallback(() => {
            navigation.dispatch(StackActions.replace('lists'))
        }, [navigation])
    )
    return null
}
