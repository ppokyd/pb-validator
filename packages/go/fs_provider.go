package pbvalidator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// FSProvider loads schemas from the local filesystem.
type FSProvider struct {
	dir string
}

// NewFSProvider returns a SchemaProvider that reads manifest and schema files
// from the given directory (e.g. "../../schemas").
func NewFSProvider(schemasDir string) *FSProvider {
	return &FSProvider{dir: schemasDir}
}

func (p *FSProvider) GetManifest(_ context.Context) (*Manifest, error) {
	data, err := os.ReadFile(filepath.Join(p.dir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("reading manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parsing manifest: %w", err)
	}
	return &m, nil
}

func (p *FSProvider) GetSchemaData(_ context.Context, path string) (json.RawMessage, error) {
	data, err := os.ReadFile(filepath.Join(p.dir, filepath.FromSlash(path)))
	if err != nil {
		return nil, fmt.Errorf("reading schema %s: %w", path, err)
	}
	return json.RawMessage(data), nil
}
