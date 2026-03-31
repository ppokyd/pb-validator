package schemas

import "embed"

// Content holds generated JSON Schema files and manifest at compile time.
//
//go:embed manifest.json pbjs/*.json
var Content embed.FS
