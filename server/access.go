package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// Level is a user's Books access level. The books_access view
// (pb-migrations/2100000000) computes it; the collection rules read the same
// view, so Go and the rules cannot disagree.
type Level string

const (
	LevelNone       Level = "none"
	LevelReadOnly   Level = "read_only"
	LevelBookkeeper Level = "bookkeeper"
	LevelAdmin      Level = "admin"
)

func (l Level) CanRead() bool  { return l == LevelReadOnly || l == LevelBookkeeper || l == LevelAdmin }
func (l Level) CanWrite() bool { return l == LevelBookkeeper || l == LevelAdmin }
func (l Level) IsAdmin() bool  { return l == LevelAdmin }

// levelFor resolves a request's caller. No auth is no access. A superuser is
// admin: the superuser already bypasses every rule, so anything less would
// only make Go stricter than the API it guards.
func levelFor(app core.App, auth *core.Record) (Level, error) {
	if auth == nil {
		return LevelNone, nil
	}
	if auth.IsSuperuser() {
		return LevelAdmin, nil
	}
	return levelForUser(app, auth.Id)
}

func levelForUser(app core.App, userID string) (Level, error) {
	if userID == "" {
		return LevelNone, nil
	}
	row, err := app.FindRecordById("books_access", userID)
	if errors.Is(err, sql.ErrNoRows) {
		return LevelNone, nil
	}
	if err != nil {
		return "", fmt.Errorf("books: read access level for %s: %w", userID, err)
	}
	return Level(row.GetString("level")), nil
}
