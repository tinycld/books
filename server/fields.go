package books

import "github.com/pocketbase/pocketbase/core"

// changedFields lists the fields whose stored and next values differ,
// skipping `updated` and the names in allowed.
func changedFields(stored, next *core.Record, allowed map[string]bool) []string {
	var changed []string
	for _, f := range next.Collection().Fields {
		name := f.GetName()
		if name == "updated" || allowed[name] {
			continue
		}
		if stored.GetString(name) != next.GetString(name) {
			changed = append(changed, name)
		}
	}
	return changed
}

// stampActor records who did something on a server-owned user field. A
// person's request writes their own id, whatever the body said. A superuser
// (the seed, an operator) may attribute the act to a user, since a superuser
// bypasses the rules that pin these fields anyway.
func stampActor(r *core.Record, field string, auth *core.Record) {
	if auth != nil && auth.IsSuperuser() {
		return
	}
	if auth == nil {
		r.Set(field, "")
		return
	}
	r.Set(field, auth.Id)
}
