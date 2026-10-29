// Vitest globals are off, so Testing Library cannot register its own
// afterEach; without this, renders from earlier tests stay in the document.
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { resetRouteParams } from './route-params'

// The core expo-router stub always answers empty search params; this lets a test open a
// screen on a deep link with setRouteParams. The stub has no useIsFocused, and a hook under
// test runs as the one focused screen.
vi.mock('expo-router', async importOriginal => {
    const stub = await importOriginal<typeof import('expo-router')>()
    const { routeParams } = await import('./route-params')
    return { ...stub, useLocalSearchParams: () => routeParams(), useIsFocused: () => true }
})

afterEach(() => {
    cleanup()
    resetRouteParams()
})
