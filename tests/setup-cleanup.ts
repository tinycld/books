// Vitest globals are off, so Testing Library cannot register its own
// afterEach; without this, renders from earlier tests stay in the document.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
