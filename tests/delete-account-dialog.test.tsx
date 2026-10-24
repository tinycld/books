// @vitest-environment happy-dom
import { OverlayProvider as PortalHost } from '@gluestack-ui/core/overlay/creator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountDialog } from '../tinycld/books/components/accounts/DeleteAccountDialog'
import { useAccountActions } from '../tinycld/books/hooks/useAccountActions'
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'
import { holdWrites, messageRefusal, seedBooks, storedAccounts } from './accounts-form-harness'
import { byTestId, fixtureRows } from './accounts-test-rows'
import { stubActions } from './accounts-view-props'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const rows = fixtureRows()
const USED = 'acct_ar_00001'
const PARENT = 'acct_bank_0001'
const FREE = 'acct_cc_00001'
const INACTIVE_USED = 'acct_fa_00007'

// The screen owns the one useAccountActions instance and hands it down.
function Host({ account, onClose }: { account: AccountRow | null; onClose: () => void }) {
    const actions = useAccountActions()
    return <DeleteAccountDialog account={account} actions={actions} onClose={onClose} />
}

function shell(children: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return (
        <QueryClientProvider client={client}>
            <OverlayProvider>
                <PortalHost>{children}</PortalHost>
            </OverlayProvider>
        </QueryClientProvider>
    )
}

function renderDialog(id: string, opts: { accounts?: AccountRow[] } = {}) {
    const accounts = opts.accounts ?? rows
    const account = accounts.find(a => a.id === id) ?? null
    const onClose = vi.fn()
    const view = render(shell(<Host account={account} onClose={onClose} />))
    return { ...view, onClose }
}

function renderWithStub(id: string, actions = stubActions()) {
    const account = rows.find(a => a.id === id) ?? null
    const onClose = vi.fn()
    render(shell(<DeleteAccountDialog account={account} actions={actions} onClose={onClose} />))
    return { actions, onClose }
}

function buttonOf(label: string) {
    return screen.getByText(label).closest('[role="button"]') as HTMLElement
}

function isDisabledButton(label: string) {
    return buttonOf(label).getAttribute('data-disabled') === 'true'
}

function inactiveIds() {
    return storedAccounts()
        .filter(a => a.inactive)
        .map(a => a.id)
        .sort()
}

beforeEach(() => {
    seedBooks()
})

describe('DeleteAccountDialog blocked states', () => {
    it('explains that an account with journal lines cannot be deleted and offers Make inactive', async () => {
        seedBooks({ linesOn: { [USED]: 1 } })
        renderDialog(USED)
        await waitFor(() =>
            expect(screen.getByText('This account is used on journal lines')).toBeTruthy()
        )
        expect(screen.getByText('Make inactive')).toBeTruthy()
        expect(screen.queryByText('Delete')).toBeNull()
    })

    it('explains that an account with sub-accounts cannot be deleted and offers Make inactive', async () => {
        renderDialog(PARENT)
        await waitFor(() => expect(screen.getByText('This account has sub-accounts')).toBeTruthy())
        expect(screen.getByText('Make inactive')).toBeTruthy()
        expect(screen.queryByText('Delete')).toBeNull()
    })

    it('a parent whose only children are inactive still blocks Delete and offers Make inactive', async () => {
        const accounts = rows.map(a =>
            a.parent === PARENT ? { ...a, inactive: true } : { ...a, inactive: a.inactive }
        )
        renderDialog(PARENT, { accounts })
        await waitFor(() => expect(screen.getByText('This account has sub-accounts')).toBeTruthy())
        expect(screen.getByText('Make inactive')).toBeTruthy()
        expect(screen.queryByText('Delete')).toBeNull()
    })

    it('does not offer Make inactive for a blocked account that is already inactive', async () => {
        seedBooks({ linesOn: { [INACTIVE_USED]: 1 } })
        renderDialog(INACTIVE_USED)
        await waitFor(() =>
            expect(screen.getByText('This account is used on journal lines')).toBeTruthy()
        )
        expect(screen.queryByText('Make inactive')).toBeNull()
        expect(screen.queryByText('Delete')).toBeNull()
        expect(screen.getByText('Cancel')).toBeTruthy()
    })

    it('pressing Make inactive in a blocked dialog makes that account inactive and closes', async () => {
        seedBooks({ linesOn: { [USED]: 1 } })
        const inactiveBefore = inactiveIds()
        const { onClose } = renderDialog(USED)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(storedAccounts().find(a => a.id === USED)?.inactive).toBe(true))
        expect(inactiveIds()).toEqual([...new Set([...inactiveBefore, USED])].sort())
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('keeps the dialog open when Make inactive is refused', async () => {
        seedBooks({
            linesOn: { [USED]: 1 },
            refusal: messageRefusal('Make the 2 active sub-accounts inactive first.'),
        })
        const { onClose } = renderDialog(USED)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() =>
            expect(screen.getByText('Make the 2 active sub-accounts inactive first.')).toBeTruthy()
        )
        expect(onClose).not.toHaveBeenCalled()
        expect(storedAccounts().find(a => a.id === USED)?.inactive).toBe(false)
    })
})

describe('DeleteAccountDialog free account', () => {
    it('shows a Delete button and no block explanation', async () => {
        renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        expect(screen.queryByText('This account is used on journal lines')).toBeNull()
        expect(screen.queryByText('This account has sub-accounts')).toBeNull()
    })

    it('pressing Delete removes the account and closes the dialog', async () => {
        const { onClose } = renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.click(screen.getByText('Delete'))
        await waitFor(() => expect(storedAccounts().some(a => a.id === FREE)).toBe(false))
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('renders the server message when the delete is refused and stays open', async () => {
        seedBooks({ refusal: messageRefusal('This account is in use.') })
        const { onClose } = renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.click(screen.getByText('Delete'))
        await waitFor(() => expect(screen.getByText('This account is in use.')).toBeTruthy())
        expect(storedAccounts().some(a => a.id === FREE)).toBe(true)
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe('DeleteAccountDialog while usage loads', () => {
    beforeEach(() => {
        seedBooks({ linesNeverReady: true })
    })

    it('offers no Delete button', async () => {
        renderDialog(FREE)
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        expect(screen.queryByText('Delete')).toBeNull()
    })

    it('labels the confirm button Checking... and disables it', () => {
        renderDialog(FREE)
        expect(screen.getByText('Delete account?')).toBeTruthy()
        expect(screen.getByText('Checking...')).toBeTruthy()
        expect(isDisabledButton('Checking...')).toBe(true)
    })

    it('keeps Cancel enabled and Cancel closes the dialog', () => {
        const { onClose } = renderDialog(FREE)
        expect(isDisabledButton('Cancel')).toBe(false)
        fireEvent.click(screen.getByText('Cancel'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not style the Checking... button as destructive', () => {
        renderDialog(FREE)
        expect(buttonOf('Checking...').getAttribute('class')).not.toContain('bg-destructive')
    })
})

describe('DeleteAccountDialog without an account', () => {
    it('renders nothing', () => {
        renderDialog('missing')
        expect(screen.queryByText('Cancel')).toBeNull()
    })
})

describe('DeleteAccountDialog uses the actions it is given', () => {
    it('calls actions.deleteAccount with the id for a free account', async () => {
        const { actions, onClose } = renderWithStub(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.click(screen.getByText('Delete'))
        await waitFor(() => expect(actions.deleteAccount).toHaveBeenCalledWith(FREE))
        expect(actions.setInactive).not.toHaveBeenCalled()
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('calls actions.setInactive with ([id], true) for a blocked account', async () => {
        const { actions } = renderWithStub(PARENT)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalledWith([PARENT], true))
        expect(actions.deleteAccount).not.toHaveBeenCalled()
    })

    it('renders actions.actionError in the body', async () => {
        renderWithStub(FREE, stubActions({ actionError: 'The server said no.' }))
        await waitFor(() => expect(screen.getByText('The server said no.')).toBeTruthy())
    })

    it('does not close when setInactive reports the id it failed on', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValue({ done: [], failed: PARENT })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalled())
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('Make inactive')).toBeTruthy()
    })

    it('does not close when setInactive reports done plus a failed id', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValue({ done: [PARENT], failed: PARENT })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalled())
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
    })

    it('does not close when setInactive ignores the call and resolves with nothing done', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValue({ done: [] })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalled())
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('Make inactive')).toBeTruthy()
    })

    it('does not close when setInactive reports only another id done', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValue({ done: [FREE] })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalled())
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
    })

    it('closes when setInactive reports exactly its own id done', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValue({ done: [PARENT] })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('accepts a second Make inactive after the first was refused', async () => {
        const actions = stubActions()
        actions.setInactive.mockResolvedValueOnce({ done: [], failed: PARENT })
        const { onClose } = renderWithStub(PARENT, actions)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalledTimes(1))
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(actions.setInactive).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('closes when setInactive reports the id done', async () => {
        const { onClose } = renderWithStub(PARENT)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('does not close when the action reports a refusal', async () => {
        const actions = stubActions()
        actions.deleteAccount.mockResolvedValue(false)
        const { onClose } = renderWithStub(FREE, actions)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.click(screen.getByText('Delete'))
        await waitFor(() => expect(actions.deleteAccount).toHaveBeenCalled())
        await act(async () => {})
        expect(onClose).not.toHaveBeenCalled()
    })

    it('disables Cancel and the confirm button while actions.isWorking', async () => {
        renderWithStub(FREE, stubActions({ isWorking: true }))
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        expect(isDisabledButton('Cancel')).toBe(true)
        expect(isDisabledButton('Delete')).toBe(true)
    })
})

describe('DeleteAccountDialog dismissal while a write is pending', () => {
    it('Escape closes an idle dialog', async () => {
        const { onClose } = renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores Escape while a held delete is pending and closes after it finishes', async () => {
        const release = holdWrites()
        const { onClose } = renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        fireEvent.click(screen.getByText('Delete'))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).not.toHaveBeenCalled()
        release()
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('ignores Escape while a held Make inactive is pending', async () => {
        const release = holdWrites()
        const { onClose } = renderDialog(PARENT)
        await waitFor(() => expect(screen.getByText('Make inactive')).toBeTruthy())
        fireEvent.click(screen.getByText('Make inactive'))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).not.toHaveBeenCalled()
        release()
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
})

describe('DeleteAccountDialog accessibility and structure', () => {
    it('gives the in-dialog error the alert role', async () => {
        renderWithStub(FREE, stubActions({ actionError: 'The server said no.' }))
        const error = await waitFor(() => screen.getByText('The server said no.'))
        expect(error.closest('[accessibilityrole="alert"]')).not.toBeNull()
    })

    it('titles the dialog Delete account? when Delete is offered', async () => {
        renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        expect(screen.getByText('Delete account?')).toBeTruthy()
    })

    it('does not title a blocked dialog Delete account?', async () => {
        renderDialog(PARENT)
        await waitFor(() => expect(screen.getByText('This account has sub-accounts')).toBeTruthy())
        expect(screen.queryByText('Delete account?')).toBeNull()
        expect(screen.getByText("This account can't be deleted")).toBeTruthy()
    })

    it('does not title a blocked, already inactive dialog Delete account?', async () => {
        seedBooks({ linesOn: { [INACTIVE_USED]: 1 } })
        renderDialog(INACTIVE_USED)
        await waitFor(() =>
            expect(screen.getByText('This account is used on journal lines')).toBeTruthy()
        )
        expect(screen.queryByText('Delete account?')).toBeNull()
        expect(screen.getByText("This account can't be deleted")).toBeTruthy()
    })

    it('names its body delete-account-dialog-body, not the shared confirm id', async () => {
        renderDialog(FREE)
        await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy())
        expect(byTestId(document.body, 'delete-account-dialog-body')).not.toBeNull()
        expect(byTestId(document.body, 'confirm-dialog-body')).toBeNull()
    })
})
