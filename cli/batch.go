package cli

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/url"
	"sort"
	"strconv"

	"tinycld.org/cli/client"
)

// batchPath is PocketBase's batch route: several record writes in one request
// and one database transaction. A document and its lines are written this way,
// as the forms write them, so a refused line leaves nothing behind.
const batchPath = "/api/batch"

// maxBatchWrites is the most writes the Books server takes in one batch (its
// batch setting). An add, a correction, and an edit of one table of a draft
// always fit (TestEveryDocumentWriteFitsInOneBatch).
const maxBatchWrites = 1100

// batchOp is one record write of a batch.
type batchOp struct {
	Method string         `json:"method"`
	URL    string         `json:"url"`
	Body   map[string]any `json:"body,omitempty"`
	// Label names the write in a refusal ("lines[1]"). It is not sent.
	Label string `json:"-"`
}

func recordsURL(collection string) string {
	return "/api/collections/" + url.PathEscape(collection) + "/records"
}

func createOp(collection, label string, body map[string]any) batchOp {
	return batchOp{Method: "POST", URL: recordsURL(collection), Body: body, Label: label}
}

func updateOp(collection, id, label string, body map[string]any) batchOp {
	return batchOp{Method: "PATCH", URL: recordsURL(collection) + "/" + url.PathEscape(id), Body: body, Label: label}
}

func deleteOp(collection, id, label string) batchOp {
	return batchOp{Method: "DELETE", URL: recordsURL(collection) + "/" + url.PathEscape(id), Label: label}
}

// sendBatch sends the writes as one transaction: all of them are stored, or
// none. The answers are not read: a command reads the document again, because
// the server computes totals after the last write.
func sendBatch(ctx context.Context, c *client.Client, ops []batchOp) error {
	// Only an edit of a draft can pass the limit: one that names two full
	// tables, one of which refuses an update of a row (a deposit's items are
	// removed and created again). One table in each call always fits.
	if len(ops) > maxBatchWrites {
		return usagef("this change is %d writes, and Books takes %d in one step: name one table of rows in each call", len(ops), maxBatchWrites)
	}
	err := c.PostJSON(ctx, batchPath, map[string]any{"requests": ops}, nil)
	return batchFailure(ops, err)
}

// batchFailure turns the refusal of a batch into the refusal of the write that
// failed. PocketBase answers a failed batch with 400 "Batch transaction
// failed." and puts the real answer under data.requests.<index>.response; the
// status, the message and the fields a caller acts on are in there. An error of
// any other shape (403 from the scope check, a proxy's page) is returned as it
// is.
func batchFailure(ops []batchOp, err error) error {
	var api *client.APIError
	if err == nil || !errors.As(err, &api) {
		return err
	}
	var outer struct {
		Data struct {
			Requests map[string]struct {
				Response json.RawMessage `json:"response"`
			} `json:"requests"`
		} `json:"data"`
	}
	if json.Unmarshal(api.Body, &outer) != nil || len(outer.Data.Requests) == 0 {
		return err
	}
	indexes := make([]int, 0, len(outer.Data.Requests))
	for key := range outer.Data.Requests {
		index, convErr := strconv.Atoi(key)
		if convErr != nil {
			return err
		}
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	first := indexes[0]
	response := outer.Data.Requests[strconv.Itoa(first)].Response
	var inner struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
	}
	if json.Unmarshal(response, &inner) != nil || inner.Status == 0 {
		return err
	}
	message := inner.Message
	if first < len(ops) && ops[first].Label != "" {
		message = ops[first].Label + ": " + message
	}
	return &client.APIError{Status: inner.Status, Message: message, Body: response}
}

const (
	recordIDLength   = 15
	recordIDAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
)

// newRecordID makes the id of a record the CLI creates in a batch: the lines of
// the same batch name it as their parent, so the server cannot be the one to
// choose it. It has the shape of PocketBase's own ids. It is a variable so a
// test can make it predictable.
var newRecordID = func() string {
	// 252 is the largest multiple of 36 a byte can hold: a byte at or above it
	// is drawn again, so every character is equally likely.
	const limit = 252
	id := make([]byte, 0, recordIDLength)
	buf := make([]byte, recordIDLength)
	for len(id) < recordIDLength {
		// crypto/rand.Read does not fail (Go 1.24 and later).
		rand.Read(buf)
		for _, b := range buf {
			if b < limit && len(id) < recordIDLength {
				id = append(id, recordIDAlphabet[int(b)%len(recordIDAlphabet)])
			}
		}
	}
	return string(id)
}
