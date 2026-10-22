package books

import (
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// overrideUserLinks is the override's optional user relation. Deleting the
// admin who granted an override clears it; the override stays as the log.
// The holder (user) is required, so PocketBase refuses to delete a holder.
var overrideUserLinks = map[string]bool{"granted_by": true}

// registerCloseOverrideHooks keeps close-date overrides honest. An override is
// the log of why a user may post into the closed period, so its user and
// reason never change and it is never deleted (the rules refuse deletes);
// revoking one moves expires_at to now.
func registerCloseOverrideHooks(app core.App) {
	app.OnRecordCreateRequest("books_close_overrides").BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "granted_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate("books_close_overrides").BindFunc(func(e *core.RecordEvent) error {
		if !e.Record.GetDateTime("expires_at").Time().After(time.Now()) {
			return refuse("A close-date override must expire in the future.")
		}
		return e.Next()
	})
	app.OnRecordUpdate("books_close_overrides").BindFunc(func(e *core.RecordEvent) error {
		stored, err := e.App.FindRecordById("books_close_overrides", e.Record.Id)
		if err != nil {
			return err
		}
		changed, err := changesBeyondUnlinks(e.App, stored, e.Record, map[string]bool{"expires_at": true}, overrideUserLinks)
		if err != nil {
			return err
		}
		if len(changed) > 0 {
			return refuse("Only an override's expiry can change.")
		}
		if e.Record.GetDateTime("expires_at").Time().After(stored.GetDateTime("expires_at").Time()) {
			return refuse("An override can be shortened or revoked, not extended. Grant a new one instead.")
		}
		return e.Next()
	})
}

// activeOverride returns the user's newest unexpired override, or nil.
func activeOverride(app core.App, userID string, now time.Time) (*core.Record, error) {
	if userID == "" {
		return nil, nil
	}
	rows, err := app.FindRecordsByFilter("books_close_overrides",
		"user = {:user} && expires_at > {:now}", "-expires_at", 1, 0,
		dbx.Params{"user": userID, "now": now.UTC().Format(types.DefaultDateLayout)})
	if err != nil {
		return nil, fmt.Errorf("books: read close-date overrides: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
