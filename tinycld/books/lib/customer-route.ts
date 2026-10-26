export const CUSTOMERS_PATH = 'books/customers'

export type CustomerRoute = { path: string; params?: Record<string, string> }

export type OpenCustomer = { kind: 'new' } | { kind: 'id'; id: string } | { kind: 'none' }

export function customerPath(id: string): CustomerRoute {
    return { path: `${CUSTOMERS_PATH}/[id]`, params: { id } }
}

export function newCustomerPath(parentId?: string): CustomerRoute {
    const path = `${CUSTOMERS_PATH}/new`
    if (!parentId) return { path }
    return { path, params: { parent: parentId } }
}

const CUSTOMER_SEGMENT = new RegExp(`/${CUSTOMERS_PATH}/([^/]+)/?$`)

// The customer the URL opens. The child stack's route is the only record of it.
export function openCustomerFromPath(pathname: string): OpenCustomer {
    const segment = CUSTOMER_SEGMENT.exec(pathname)?.[1]
    if (!segment) return { kind: 'none' }
    if (segment === 'new') return { kind: 'new' }
    return { kind: 'id', id: segment }
}

// One customer at a time in the child stack: opening another replaces the open one,
// so Back always returns to the list.
export function navigationModeFor(open: OpenCustomer): 'push' | 'replace' {
    return open.kind === 'none' ? 'push' : 'replace'
}

// The child stack's customer screens, after its transparent `index`.
export const CUSTOMER_DETAIL_SCREENS = ['[id]', 'new'] as const
