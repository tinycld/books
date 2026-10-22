package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/apis"
)

// refuse is how every ledger rule says no: a 400 whose message the client can
// show as is. PocketBase passes an ApiError from a model hook through the REST
// handler unchanged, so a refusal reads the same over REST and in Go.
func refuse(format string, args ...any) error {
	return apis.NewBadRequestError(fmt.Sprintf(format, args...), nil)
}
