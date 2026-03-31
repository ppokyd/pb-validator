package validator

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"

	"github.com/ppokyd/cursor-cloud-test/schemas"
	jsonschema "github.com/santhosh-tekuri/jsonschema/v5"
)

// Runtime selects which adapter surface to validate.
type Runtime string

const (
	RuntimePbjs Runtime = "pbjs"
	RuntimePbs  Runtime = "pbs"
)

// Manifest matches schemas/manifest.json.
type Manifest struct {
	Version string                       `json:"version"`
	Bidders map[string]BidderManifest    `json:"bidders"`
	Sources map[string]json.RawMessage   `json:"sources,omitempty"`
}

// BidderManifest lists schema paths per surface.
type BidderManifest struct {
	Pbjs *SchemaRef `json:"pbjs"`
	Pbs  *SchemaRef `json:"pbs"`
}

// SchemaRef points to a file under schemas/.
type SchemaRef struct {
	Schema string `json:"schema"`
}

// ValidationResult is returned after validating params.
type ValidationResult struct {
	Valid  bool     `json:"valid"`
	Errors []string `json:"errors,omitempty"`
}

var compiled = map[string]*jsonschema.Schema{}

const schemaURLPrefix = "https://prebid.org/schemas/"

// LoadManifest reads and parses schemas/manifest.json from the embedded FS.
func LoadManifest() (*Manifest, error) {
	raw, err := fs.ReadFile(schemas.Content, "manifest.json")
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}

func schemaKey(runtime Runtime, bidderCode string) string {
	return string(runtime) + "/" + bidderCode
}

// GetSchema returns JSON Schema document bytes for a bidder and runtime.
func GetSchema(runtime Runtime, bidderCode string) ([]byte, error) {
	m, err := LoadManifest()
	if err != nil {
		return nil, err
	}
	b, ok := m.Bidders[bidderCode]
	if !ok {
		return nil, fmt.Errorf("unknown bidder %q", bidderCode)
	}
	var ref *SchemaRef
	switch runtime {
	case RuntimePbjs:
		ref = b.Pbjs
	case RuntimePbs:
		ref = b.Pbs
	default:
		return nil, fmt.Errorf("unsupported runtime %q", runtime)
	}
	if ref == nil || ref.Schema == "" {
		return nil, fmt.Errorf("no %s schema for bidder %q", runtime, bidderCode)
	}
	data, err := fs.ReadFile(schemas.Content, ref.Schema)
	if err != nil {
		return nil, fmt.Errorf("read schema %s: %w", ref.Schema, err)
	}
	return data, nil
}

func compiler() *jsonschema.Compiler {
	c := jsonschema.NewCompiler()
	c.Draft = jsonschema.Draft7
	return c
}

func schemaDocURL(runtime Runtime, bidderCode string) string {
	return schemaURLPrefix + string(runtime) + "/" + bidderCode + ".json"
}

// Validate checks params against the schema for bidderCode and runtime.
func Validate(runtime Runtime, bidderCode string, params json.RawMessage) (*ValidationResult, error) {
	raw, err := GetSchema(runtime, bidderCode)
	if err != nil {
		return nil, err
	}
	key := schemaKey(runtime, bidderCode)
	sch, ok := compiled[key]
	if !ok {
		url := schemaDocURL(runtime, bidderCode)
		c := compiler()
		if err := c.AddResource(url, bytes.NewReader(raw)); err != nil {
			return nil, fmt.Errorf("add schema resource: %w", err)
		}
		sch, err = c.Compile(url)
		if err != nil {
			return nil, fmt.Errorf("compile schema: %w", err)
		}
		compiled[key] = sch
	}
	var doc interface{}
	dec := json.NewDecoder(bytes.NewReader(params))
	dec.UseNumber()
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("parse params json: %w", err)
	}
	if err := sch.Validate(doc); err != nil {
		return &ValidationResult{Valid: false, Errors: []string{err.Error()}}, nil
	}
	return &ValidationResult{Valid: true}, nil
}

// ListBidders returns bidder codes present in the manifest.
func ListBidders() ([]string, error) {
	m, err := LoadManifest()
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(m.Bidders))
	for code := range m.Bidders {
		out = append(out, code)
	}
	return out, nil
}
