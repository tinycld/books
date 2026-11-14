package books

import "testing"

// Spec §4.1: a public token is 43 URL-safe characters (256 random bits).
func TestNewPublicToken_Is43URLSafeCharacters(t *testing.T) {
	token, err := newPublicToken()
	if err != nil {
		t.Fatalf("newPublicToken: %v", err)
	}
	if len(token) != 43 {
		t.Errorf("token %q has %d characters, want 43", token, len(token))
	}
	if !publicTokenPattern.MatchString(token) {
		t.Errorf("token %q does not match %s", token, publicTokenPattern)
	}
}

// A token is a credential: 1 000 tokens are 1 000 different tokens.
func TestNewPublicToken_NeverRepeats(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for i := 0; i < 1000; i++ {
		token, err := newPublicToken()
		if err != nil {
			t.Fatalf("newPublicToken call %d: %v", i+1, err)
		}
		if seen[token] {
			t.Fatalf("call %d repeated token %q", i+1, token)
		}
		seen[token] = true
	}
	if len(seen) != 1000 {
		t.Errorf("%d different tokens from 1000 calls, want 1000", len(seen))
	}
}

// The pattern refuses what is not a token.
func TestPublicTokenPattern_RefusesMalformedTokens(t *testing.T) {
	good := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123_-x"
	if !publicTokenPattern.MatchString(good) {
		t.Errorf("pattern refuses the well-formed %q", good)
	}
	for _, bad := range []string{"", "abc", good + "x", good[:42] + "/", "../x", good[:42] + "="} {
		if publicTokenPattern.MatchString(bad) {
			t.Errorf("pattern accepts the malformed %q", bad)
		}
	}
}
