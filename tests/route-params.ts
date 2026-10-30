// The search params `useLocalSearchParams` answers in a unit test, as a deep link would set
// them. The shared setup file serves them through expo-router and resets them after each test.
type RouteParams = Record<string, string | string[]>

let params: RouteParams | null = null

export function setRouteParams(next: RouteParams) {
    params = next
}

export function resetRouteParams() {
    params = null
}

// A fresh empty object while unset, as the expo-router stub answers.
export function routeParams(): RouteParams {
    return params ?? {}
}
