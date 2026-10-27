package books

import (
	"fmt"

	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/apis"
)

// refuse is how every ledger rule says no: a 400 whose message the client can
// show as is. PocketBase passes an ApiError from a model hook through the REST
// handler unchanged, so a refusal reads the same over REST and in Go.
func refuse(format string, args ...any) error {
	return apis.NewBadRequestError(fmt.Sprintf(format, args...), nil)
}

// refuseField is refuse for a rule that belongs to one field: the 400's data
// names the field, in the shape PocketBase gives its own field errors, so the
// client's form shows the message under that field.
func refuseField(field, format string, args ...any) error {
	msg := fmt.Sprintf(format, args...)
	return apis.NewBadRequestError(msg, validation.Errors{
		field: validation.NewError("validation_books_customer", msg),
	})
}
