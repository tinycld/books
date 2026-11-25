// The words of a sidebar filter, lower case. An empty filter has no words.
export function filterTerms(query: string): string[] {
    return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

// True when every word is somewhere in the texts, so "new inv" finds the New action
// Invoice and "sales cust" finds the report Sales by Customer.
export function matchesTerms(terms: readonly string[], texts: readonly string[]): boolean {
    const haystack = texts.join(' ').toLowerCase()
    return terms.every(term => haystack.includes(term))
}
