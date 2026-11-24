package cli

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
)

// rawRecord is a record as the server sends it. Numbers stay json.Number, so
// integer cents are printed with the digits the server sent.
type rawRecord map[string]any

func (r *rawRecord) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil {
		return err
	}
	*r = m
	return nil
}

// record is a record as the CLI prints it: exactly the keys of recordKeys, in
// that order. A key the server sends and resources.json does not name is
// dropped, and a key the server does not send is null, so the output of a
// command has one shape whatever version the server is.
type record struct {
	keys   []string
	values map[string]any
}

func project(res *resource, raw rawRecord) record {
	keys := recordKeys(res)
	values := make(map[string]any, len(keys))
	for _, key := range keys {
		values[key] = raw[key]
	}
	return record{keys: keys, values: values}
}

func (r record) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, key := range r.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		name, err := json.Marshal(key)
		if err != nil {
			return nil, err
		}
		value, err := json.Marshal(r.values[key])
		if err != nil {
			return nil, err
		}
		buf.Write(name)
		buf.WriteByte(':')
		buf.Write(value)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func (r record) id() string { return r.cell("id") }

// label names the record in a message: the resource's label field, or the id.
func (r record) label(res *resource) string {
	if res.Label != "" {
		if text := r.cell(res.Label); text != "" {
			return text
		}
	}
	return r.id()
}

// cell is a value as table text.
func (r record) cell(key string) string {
	return cellText(r.values[key])
}

func cellText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case json.Number:
		return t.String()
	case bool:
		if t {
			return "yes"
		}
		return "no"
	case []any:
		parts := make([]string, len(t))
		for i, item := range t {
			parts[i] = cellText(item)
		}
		return strings.Join(parts, ",")
	case map[string]any:
		keys := make([]string, 0, len(t))
		for key := range t {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := []string{}
		for _, key := range keys {
			if text := cellText(t[key]); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, ", ")
	default:
		data, _ := json.Marshal(t)
		return string(data)
	}
}
