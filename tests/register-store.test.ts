import { beforeEach, describe, expect, it } from 'vitest'
import { useRegisterStore } from '../tinycld/books/stores/register-store'

describe('useRegisterStore', () => {
    beforeEach(() => {
        useRegisterStore.setState({ selected: null })
    })

    it('starts with nothing selected', () => {
        expect(useRegisterStore.getInitialState().selected).toBeNull()
    })

    it('openEntry selects the account and entry', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        expect(useRegisterStore.getState().selected).toEqual({ accountId: 'a1', entryId: 'e1' })
    })

    it('opening a second entry replaces the first', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        useRegisterStore.getState().openEntry('a2', 'e2')
        expect(useRegisterStore.getState().selected).toEqual({ accountId: 'a2', entryId: 'e2' })
    })

    it('close clears the selection', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        useRegisterStore.getState().close()
        expect(useRegisterStore.getState().selected).toBeNull()
    })
})
