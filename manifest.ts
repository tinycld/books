const manifest = {
    name: 'Books',
    slug: 'books',
    version: '0.1.0',
    description: 'Double-entry bookkeeping and accounting.',
    terms: { file: 'TERMS.md', version: '2026-11-24' },
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
    // The Books settings sections as panels of core Settings (Settings, group Books): the
    // same sections, in the same order and with the same labels, as the Books settings
    // screen (lib/settings-sections.ts). tests/settings-panels.test.ts holds the two lists equal.
    settings: [
        { slug: 'company', label: 'Company', component: 'settings/company' },
        { slug: 'accounting', label: 'Accounting', component: 'settings/accounting' },
        { slug: 'sales', label: 'Sales', component: 'settings/sales' },
        { slug: 'purchases', label: 'Purchases', component: 'settings/purchases' },
        { slug: 'numbering', label: 'Numbering', component: 'settings/numbering' },
        { slug: 'form-1099', label: '1099s', component: 'settings/form-1099' },
        { slug: 'access', label: 'Access', component: 'settings/access' },
    ],
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
    peerVersions: { '@tinycld/core': '>=0.12.0 <0.13.0' },
    server: { package: 'server', module: 'tinycld.org/packages/books' },
    // The `tinycld books` commands (cli/). The generator links the module into
    // the CLI shell. A command signs in through the shell and needs the scopes
    // that server/oauth_scopes.go registers: books:read to list and show,
    // books:write to add, edit and delete.
    cli: { package: 'cli', module: 'tinycld.org/packages/books/cli' },
    // A report row whose `open` is books/history/<collection>/<id> opens the record's
    // history in core's side panel beside the report on a wide window (core D5).
    reportPanels: [{ path: 'history', component: 'components/history/RecordHistoryPanel' }],
}

export default manifest
