const manifest = {
    name: 'Books',
    slug: 'books',
    version: '0.1.0',
    description: 'Double-entry bookkeeping and accounting.',
    routes: { directory: 'screens' },
    // The customer's estimate page (/p/books/estimates/<token>), outside the auth gate.
    publicRoutes: { directory: 'public-screens' },
    nav: {
        label: 'Books',
        icon: 'book-open',
        order: 30,
        shortcut: 'k',
    },
    setupSteps: [
        { id: 'accounting', label: 'Accounting', module: 'setup/accounting', order: 'a1V' },
    ],
    help: { directory: 'help' },
    sidebar: { component: 'sidebar' },
    provider: { component: 'provider' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
    // Searchable through core's federated /api/search, which reads the Go
    // source in server/search.go. The adapter only handles selection.
    search: { adapter: 'search-adapter' },
    // Forms hosts: `forms` is the data the generator reads in Node
    // (server/form_hosts.json), `forms-ui` the components the forms render.
    forms: { hosts: 'forms', ui: 'forms-ui' },
    peerVersions: { '@tinycld/core': '>=0.8 <1' },
    server: { package: 'server', module: 'tinycld.org/packages/books' },
    // A report row whose `open` is books/history/<collection>/<id> opens the record's
    // history in core's side panel beside the report on a wide window (core D5).
    reportPanels: [{ path: 'history', component: 'components/history/RecordHistoryPanel' }],
}

export default manifest
