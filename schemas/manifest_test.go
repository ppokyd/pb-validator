package schemas

import (
	"encoding/json"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

// TestManifestSchemaPaths ensures every manifest schema path exists and is valid JSON.
func TestManifestSchemaPaths(t *testing.T) {
	raw, err := fs.ReadFile(Content, "manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Bidders map[string]struct {
			Pbjs *struct{ Schema string `json:"schema"` } `json:"pbjs"`
			Pbs  *struct{ Schema string `json:"schema"` } `json:"pbs"`
		} `json:"bidders"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("manifest json: %v", err)
	}
	for bidder, b := range doc.Bidders {
		for _, surface := range []struct {
			name string
			ref  *struct{ Schema string `json:"schema"` }
		}{
			{"pbjs", b.Pbjs},
			{"pbs", b.Pbs},
		} {
			if surface.ref == nil || surface.ref.Schema == "" {
				continue
			}
			p := surface.ref.Schema
			if strings.Contains(p, "..") || filepath.IsAbs(p) {
				t.Fatalf("bidder %q %s: invalid schema path %q", bidder, surface.name, p)
			}
			data, err := fs.ReadFile(Content, p)
			if err != nil {
				t.Fatalf("bidder %q %s: read %q: %v", bidder, surface.name, p, err)
			}
			if !json.Valid(data) {
				t.Fatalf("bidder %q %s: %q is not valid JSON", bidder, surface.name, p)
			}
		}
	}
}
