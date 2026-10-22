const manifest = {
    name: 'Books',
    slug: 'books',
    version: '0.1.0',
    description: 'Double-entry bookkeeping and accounting.',
    routes: { directory: 'screens' },
    nav: {
        label: 'Books',
        icon: 'book-open',
        order: 30,
        shortcut: 'k',
    },
    sidebar: { component: 'sidebar' },
    provider: { component: 'provider' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
    // Searchable through core's federated /api/search, which reads the Go
    // source in server/search.go. The adapter only handles selection.
    search: { adapter: 'search-adapter' },
    peerVersions: { '@tinycld/core': '>=0.8 <1' },
    server: { package: 'server', module: 'tinycld.org/packages/books' },
}

export default manifest
