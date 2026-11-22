// One email address with no display name and a dot in its domain: the rule of Go
// isOneBareAddress (server/email_delivery.go). Go parses the address with net/mail
// ParseAddress and takes it only when the parsed address is the given text, so a
// display name, angle brackets, a comment, a space or a quoted local part (its quotes
// are removed) is refused. What is left is the addr-spec of net/mail: a dot-atom local
// part, then "@", then a dot-atom domain or a domain literal of an IP address. A
// character from U+0080 up is an atom character (RFC 6532), as in Go isAtext.

// RFC 5322 specials, which are not atom characters (Go isAtext).
const SPECIALS = new Set(['(', ')', '<', '>', '[', ']', ':', ';', '@', '\\', ',', '"'])

function isAtomCharacter(char: string): boolean {
    if (SPECIALS.has(char)) return false
    const code = char.codePointAt(0) ?? 0
    return (code >= 0x21 && code <= 0x7e) || code >= 0x80
}

// A dot-atom as Go consumeAtom(dot, not permissive) takes it: atom characters and dots,
// with no dot at the start or the end and no two dots in a row.
function isDotAtom(text: string): boolean {
    if (text === '' || text.startsWith('.') || text.endsWith('.') || text.includes('..')) {
        return false
    }
    return [...text].every(char => char === '.' || isAtomCharacter(char))
}

// The four bytes of a dotted IPv4 address, as Go netip parseIPv4Fields reads it: four
// decimal fields of 0 to 255, with no leading zero.
function ipv4Bytes(text: string): number[] | null {
    const fields = text.split('.')
    if (fields.length !== 4) return null
    const bytes = fields.map(field => {
        if (!/^[0-9]+$/.test(field) || (field.length > 1 && field.startsWith('0'))) return -1
        const value = Number(field)
        return value > 255 ? -1 : value
    })
    return bytes.includes(-1) ? null : bytes
}

const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/

// The 16 bytes of an IPv6 address, as Go netip parseIPv6 reads it with no zone: groups
// of 1 to 4 hex digits, at most one "::" that stands for at least one group of zeros,
// and an optional IPv4 address in the place of the last two groups.
function ipv6Bytes(text: string): number[] | null {
    const halves = text.split('::')
    if (halves.length > 2) return null
    const hasEllipsis = halves.length === 2
    const front = groupBytes(halves[0], !hasEllipsis)
    const back = hasEllipsis ? groupBytes(halves[1], true) : []
    if (front === null || back === null) return null
    if (!hasEllipsis) return front.length === 16 ? front : null
    const zeros = 16 - front.length - back.length
    if (zeros < 2) return null
    return [...front, ...new Array<number>(zeros).fill(0), ...back]
}

// The bytes of the colon-separated groups of one side of an IPv6 "::". Only the side
// that ends the address may end with an IPv4 address.
function groupBytes(half: string, endsAddress: boolean): number[] | null {
    if (half === '') return []
    const groups = half.split(':')
    const last = groups.at(-1) ?? ''
    const ipv4 = endsAddress && last.includes('.') ? ipv4Bytes(last) : []
    if (ipv4 === null) return null
    const hexGroups = ipv4.length === 0 ? groups : groups.slice(0, -1)
    if (!hexGroups.every(group => HEX_GROUP.test(group))) return null
    const bytes = hexGroups.flatMap(group => {
        const value = Number.parseInt(group, 16)
        return [value >> 8, value & 0xff]
    })
    return [...bytes, ...ipv4]
}

// The 16 bytes of an IP address as Go net.ParseIP gives them (an IPv4 address becomes
// ::ffff:a.b.c.d), or null. Go netip ParseAddr picks the parser by the first "." or
// ":" of the text; a zone ("%") is refused by net.ParseIP.
function ipBytes(text: string): number[] | null {
    const marker = /[.:%]/.exec(text)?.[0]
    if (marker === '.') {
        const bytes = ipv4Bytes(text)
        return bytes === null ? null : [...new Array<number>(10).fill(0), 0xff, 0xff, ...bytes]
    }
    if (marker === ':' && !text.includes('%')) return ipv6Bytes(text)
    return null
}

// Go net IP.To4 of 16 bytes: an IPv4-mapped address.
function isIPv4Mapped(bytes: number[]): boolean {
    return bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff
}

// A domain literal as Go consumeDomainLiteral takes it: "[IPv6:<any IP>]" or
// "[<an IPv4 or IPv4-mapped address>]".
function isDomainLiteral(text: string): boolean {
    if (!text.startsWith('[') || !text.endsWith(']')) return false
    const inner = text.slice(1, -1)
    if (inner.startsWith('IPv6:')) return ipBytes(inner.slice('IPv6:'.length)) !== null
    const bytes = ipBytes(inner)
    return bytes !== null && isIPv4Mapped(bytes)
}

export function isOneBareAddress(address: string): boolean {
    const at = address.indexOf('@')
    if (at <= 0) return false
    const local = address.slice(0, at)
    const domain = address.slice(at + 1)
    if (!isDotAtom(local)) return false
    if (!isDotAtom(domain) && !isDomainLiteral(domain)) return false
    return domain.includes('.')
}
