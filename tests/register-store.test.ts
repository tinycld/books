import { beforeEach, describe, expect, it } from 'vitest'
import { useRegisterStore } from '../tinycld/books/stores/register-store'

describe('useRegisterStore', () => {
    beforeEach(() => {
        useRegisterStore.setState({ selected: null, anchor: null })
    })

    it('openEntry sets the selection and the anchor to the same entry', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        expect(useRegisterStore.getState().selected).toEqual({ accountId: 'a1', entryId: 'e1' })
        expect(useRegisterStore.getState().anchor).toEqual({ accountId: 'a1', entryId: 'e1' })
    })

    // The table that comes back after the drawer closes keeps the entry that was open in view.
    it('close clears the selection and keeps the anchor', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        useRegisterStore.getState().close()
        expect(useRegisterStore.getState().selected).toBeNull()
        expect(useRegisterStore.getState().anchor).toEqual({ accountId: 'a1', entryId: 'e1' })
    })

    it('reset clears the selection and the anchor', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        useRegisterStore.getState().reset()
        expect(useRegisterStore.getState().selected).toBeNull()
        expect(useRegisterStore.getState().anchor).toBeNull()
    })

    // The register's leave cleanup runs after the drawer was closed already.
    it('reset after open then close still clears the anchor', () => {
        useRegisterStore.getState().openEntry('a1', 'e1')
        useRegisterStore.getState().close()
        useRegisterStore.getState().reset()
        expect(useRegisterStore.getState().selected).toBeNull()
        expect(useRegisterStore.getState().anchor).toBeNull()
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
