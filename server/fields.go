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

// actorNameMax is the length, in characters, of a stamped name field. The
// users name field allows 255, so a longer name is cut here; a copy of it at
// full length would fail the stamped field's max and refuse the save.
const actorNameMax = 200

// stampActorName is stampActor for a copy of the person's name, which stays
// after the user record is deleted. The copy is the name's first actorNameMax
// characters (runes, not bytes).
func stampActorName(r *core.Record, field string, auth *core.Record) {
	if auth != nil && auth.IsSuperuser() {
		return
	}
	if auth == nil {
		r.Set(field, "")
		return
	}
	name := []rune(auth.GetString("name"))
	if len(name) > actorNameMax {
		name = name[:actorNameMax]
	}
	r.Set(field, string(name))
}
