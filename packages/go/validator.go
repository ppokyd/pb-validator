// Package pbvalidator validates Prebid bidder params using JSON Schemas
// aligned with prebid.github.io and prebid-server.
package pbvalidator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

var defaultPrinter = message.NewPrinter(language.English)

// Runtime identifies the Prebid runtime environment.
type Runtime string

const (
	RuntimePbjs Runtime = "pbjs"
	RuntimePbs  Runtime = "pbs"
)

// ValidationResult holds the outcome of a schema validation.
type ValidationResult struct {
	Valid  bool     `json:"valid"`
	Errors []string `json:"errors,omitempty"`
}

// Manifest describes the schema index: version info, upstream sources, and
// the mapping of bidder codes to their per-runtime schema paths.
type Manifest struct {
	Version string                     `json:"version"`
	Sources map[string]json.RawMessage `json:"sources,omitempty"`
	Bidders map[string]BidderEntry     `json:"bidders"`
}

// BidderEntry holds the optional schema references for each runtime.
type BidderEntry struct {
	Pbjs *SchemaRef `json:"pbjs"`
	Pbs  *SchemaRef `json:"pbs"`
}

// SchemaRef points to a schema file relative to the schemas root.
type SchemaRef struct {
	Schema string `json:"schema"`
}

// SchemaProvider abstracts how schemas are loaded. Implementations differ
// between filesystem, HTTP, embedded, etc.
type SchemaProvider interface {
	GetManifest(ctx context.Context) (*Manifest, error)
	GetSchemaData(ctx context.Context, path string) (json.RawMessage, error)
}

var (
	ErrUnknownBidder = errors.New("unknown bidder")
	ErrNoSchema      = errors.New("no schema for bidder")
)

// Client validates bidder params against JSON Schemas.
type Client struct {
	provider SchemaProvider
	cache    sync.Map // key: "runtime/bidder" → *jsonschema.Schema
}

// NewClient creates a validator client backed by the given schema provider.
func NewClient(provider SchemaProvider) *Client {
	return &Client{provider: provider}
}

// LoadManifest returns the full manifest (version + bidder index).
func (c *Client) LoadManifest(ctx context.Context) (*Manifest, error) {
	return c.provider.GetManifest(ctx)
}

// ListBidders returns a sorted slice of all supported bidder codes.
func (c *Client) ListBidders(ctx context.Context) ([]string, error) {
	m, err := c.LoadManifest(ctx)
	if err != nil {
		return nil, err
	}
	codes := make([]string, 0, len(m.Bidders))
	for k := range m.Bidders {
		codes = append(codes, k)
	}
	sort.Strings(codes)
	return codes, nil
}

// GetSchema returns the raw JSON Schema for a bidder in the given runtime.
func (c *Client) GetSchema(ctx context.Context, runtime Runtime, bidderCode string) (json.RawMessage, error) {
	m, err := c.LoadManifest(ctx)
	if err != nil {
		return nil, err
	}
	b, ok := m.Bidders[bidderCode]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnknownBidder, bidderCode)
	}
	var ref *SchemaRef
	switch runtime {
	case RuntimePbjs:
		ref = b.Pbjs
	case RuntimePbs:
		ref = b.Pbs
	default:
		return nil, fmt.Errorf("%w: no %s schema for bidder: %s", ErrNoSchema, runtime, bidderCode)
	}
	if ref == nil || ref.Schema == "" {
		return nil, fmt.Errorf("no %s schema for bidder: %s", runtime, bidderCode)
	}
	return c.provider.GetSchemaData(ctx, ref.Schema)
}

// Validate checks params against the JSON Schema for a bidder. It returns
// a ValidationResult (not an error) for invalid params. Errors are only
// returned for operational failures (unknown bidder, missing schema, etc.).
func (c *Client) Validate(ctx context.Context, runtime Runtime, bidderCode string, params any) (*ValidationResult, error) {
	schemaData, err := c.GetSchema(ctx, runtime, bidderCode)
	if err != nil {
		return nil, err
	}

	key := string(runtime) + "/" + bidderCode
	compiled, err := c.getOrCompile(key, schemaData)
	if err != nil {
		return nil, fmt.Errorf("compiling schema for %s: %w", key, err)
	}

	v, err := toValidatable(params)
	if err != nil {
		return nil, fmt.Errorf("marshalling params: %w", err)
	}

	if err := compiled.Validate(v); err != nil {
		var verr *jsonschema.ValidationError
		if errors.As(err, &verr) {
			return &ValidationResult{
				Valid:  false,
				Errors: flattenErrors(verr),
			}, nil
		}
		return nil, err
	}
	return &ValidationResult{Valid: true}, nil
}

func (c *Client) getOrCompile(key string, schemaData json.RawMessage) (*jsonschema.Schema, error) {
	if v, ok := c.cache.Load(key); ok {
		return v.(*jsonschema.Schema), nil
	}

	compiler := jsonschema.NewCompiler()
	doc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(schemaData)))
	if err != nil {
		return nil, err
	}
	if err := compiler.AddResource(key+".json", doc); err != nil {
		return nil, err
	}
	sch, err := compiler.Compile(key + ".json")
	if err != nil {
		return nil, err
	}
	c.cache.Store(key, sch)
	return sch, nil
}

// toValidatable ensures params are in the any-typed form that the jsonschema
// library expects (map[string]any, []any, float64, etc.).
func toValidatable(params any) (any, error) {
	switch params.(type) {
	case map[string]any, []any, float64, bool, nil, string:
		return params, nil
	}
	b, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// flattenErrors extracts human-readable error strings from a ValidationError
// tree, producing output similar to Ajv's error format.
func flattenErrors(verr *jsonschema.ValidationError) []string {
	var errs []string
	collectErrors(verr, &errs)
	if len(errs) == 0 {
		errs = append(errs, verr.Error())
	}
	return errs
}

func collectErrors(verr *jsonschema.ValidationError, out *[]string) {
	if len(verr.Causes) == 0 {
		loc := "/" + strings.Join(verr.InstanceLocation, "/")
		msg := verr.ErrorKind.LocalizedString(defaultPrinter)
		*out = append(*out, strings.TrimSpace(loc+" "+msg))
		return
	}
	for _, cause := range verr.Causes {
		collectErrors(cause, out)
	}
}
