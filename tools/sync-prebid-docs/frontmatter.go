package main

import (
	"bytes"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// parseYAMLFrontMatter returns key-value pairs from the first YAML document
// between leading --- and the next --- line.
func parseYAMLFrontMatter(src []byte) (map[string]any, error) {
	s := bytes.TrimSpace(src)
	if !bytes.HasPrefix(s, []byte("---")) {
		return nil, fmt.Errorf("no front matter")
	}
	rest := bytes.TrimPrefix(s, []byte("---"))
	rest = bytes.TrimSpace(rest)
	idx := bytes.Index(rest, []byte("\n---"))
	if idx < 0 {
		return nil, fmt.Errorf("no closing front matter delimiter")
	}
	yamlBlock := rest[:idx]
	var doc map[string]any
	if err := yaml.Unmarshal(yamlBlock, &doc); err != nil {
		return nil, fmt.Errorf("yaml: %w", err)
	}
	return doc, nil
}

func layoutIsBidder(doc map[string]any) bool {
	v, ok := doc["layout"]
	if !ok {
		return false
	}
	s, ok := v.(string)
	return ok && strings.TrimSpace(strings.ToLower(s)) == "bidder"
}

func bidderCode(doc map[string]any) (string, bool) {
	v, ok := doc["biddercode"]
	if !ok {
		return "", false
	}
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return "", false
		}
		return s, true
	case int:
		return fmt.Sprintf("%d", t), true
	case int64:
		return fmt.Sprintf("%d", t), true
	case float64:
		// YAML may parse numbers as float64.
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t)), true
		}
		return "", false
	default:
		return "", false
	}
}
