package books

import "github.com/pocketbase/pocketbase/core"

func registerLineHooks(app core.App) {
	app.OnRecordCreate("books_journal_lines").BindFunc(func(e *core.RecordEvent) error {
		if err := stampCurrency(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})
}
