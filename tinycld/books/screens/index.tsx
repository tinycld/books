import { useFocusEffect } from 'expo-router'
import { useLandOnRoute } from '../hooks/useStackScreens'

/**
 * The bare `/a/books` lands on the dashboard. The move replaces this screen in
 * Books' own stack instead of using a global `<Redirect>`: since expo-router 58
 * a router call is queued and runs after the next effects, so a `<Redirect>`
 * could land after the user had already moved to another package and pull them
 * back into Books. A stack action changes only Books' own history, never which
 * package is shown.
 *
 * A second navigation to `/a/books` while the first is still landing (a Books tap
 * during the post-login redirect) pushes this screen over a dashboard that is
 * already there; it then pops back to that dashboard, so the stack never holds two.
 */
export default function BooksIndex() {
    const landOnDashboard = useLandOnRoute('dashboard')
    useFocusEffect(landOnDashboard)
    return null
}
