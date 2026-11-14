package books

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"regexp"
)

// publicTokenPattern is the shape of an estimate's public_token: 43 URL-safe
// base64 characters, as the field's schema pattern
// (pb-migrations/2100000012_create_books_estimates.js) and the client fixture.
var publicTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// newPublicToken is the credential of an estimate's customer link: 32 bytes
// (256 bits) from the system's random source, as 43 URL-safe characters. It is
// set once, by createQuote, and never changes.
func newPublicToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("books: make the estimate's public token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
