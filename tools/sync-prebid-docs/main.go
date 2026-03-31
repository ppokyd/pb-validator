package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const (
	docsRepoURL = "https://github.com/prebid/prebid.github.io.git"
	docsSubdir  = "dev-docs/bidders"
)

type bidderInfo struct {
	Title string
	File  string
}

func main() {
	outDir := flag.String("out", "schemas", "directory containing manifest.json and pbjs/")
	repoURL := flag.String("repo", docsRepoURL, "prebid.github.io git URL")
	ref := flag.String("ref", "master", "git ref to fetch (branch or tag)")
	keepTemp := flag.Bool("keep-temp", false, "do not remove temporary clone directory")
	flag.Parse()

	absOut, err := filepath.Abs(*outDir)
	if err != nil {
		log.Fatal(err)
	}
	pbjsDir := filepath.Join(absOut, "pbjs")
	if err := os.MkdirAll(pbjsDir, 0o755); err != nil {
		log.Fatal(err)
	}

	tmpRoot, err := os.MkdirTemp("", "prebid-docs-*")
	if err != nil {
		log.Fatal(err)
	}
	if !*keepTemp {
		defer os.RemoveAll(tmpRoot)
	} else {
		log.Printf("keeping clone at %s", tmpRoot)
	}

	repoDir := filepath.Join(tmpRoot, "prebid.github.io")
	cmd := exec.Command("git", "clone", "--depth", "1", "--branch", *ref, *repoURL, repoDir)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Fatalf("git clone: %v", err)
	}

	headOut, err := exec.Command("git", "-C", repoDir, "rev-parse", "HEAD").Output()
	if err != nil {
		log.Fatalf("git rev-parse: %v", err)
	}
	docsCommit := strings.TrimSpace(string(headOut))

	biddersDir := filepath.Join(repoDir, docsSubdir)
	entries, err := os.ReadDir(biddersDir)
	if err != nil {
		log.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, ent := range entries {
		if ent.IsDir() || !strings.HasSuffix(strings.ToLower(ent.Name()), ".md") {
			continue
		}
		names = append(names, ent.Name())
	}
	sort.Strings(names)

	seen := make(map[string]bidderInfo)
	var skipped int

	for _, name := range names {
		path := filepath.Join(biddersDir, name)
		body, err := os.ReadFile(path)
		if err != nil {
			log.Printf("skip read %s: %v", name, err)
			skipped++
			continue
		}
		fm, err := parseYAMLFrontMatter(body)
		if err != nil {
			skipped++
			continue
		}
		if !layoutIsBidder(fm) {
			skipped++
			continue
		}
		code, ok := bidderCode(fm)
		if !ok {
			skipped++
			continue
		}
		title := ""
		if t, ok := fm["title"].(string); ok {
			title = strings.TrimSpace(t)
		}
		if prev, dup := seen[code]; dup {
			log.Printf("duplicate biddercode %q: keeping %s, skipping %s", code, prev.File, name)
			skipped++
			continue
		}
		seen[code] = bidderInfo{Title: title, File: name}
	}

	codes := make([]string, 0, len(seen))
	for c := range seen {
		codes = append(codes, c)
	}
	sort.Strings(codes)

	reserved := map[string]struct{}{
		"ci_fixture": {},
	}

	for _, code := range codes {
		if _, skip := reserved[code]; skip {
			log.Fatalf("generated bidder code %q conflicts with reserved name; rename reserved entry or exclude this doc", code)
		}
		if err := writePbjsSchema(pbjsDir, code, seen[code]); err != nil {
			log.Fatalf("write schema %s: %v", code, err)
		}
	}

	keep := make(map[string]struct{}, len(codes)+1)
	for _, c := range codes {
		keep[c] = struct{}{}
	}
	keep["ci_fixture"] = struct{}{}
	if err := cleanupPbjs(pbjsDir, keep); err != nil {
		log.Fatalf("cleanup pbjs: %v", err)
	}

	manifestPath := filepath.Join(absOut, "manifest.json")
	if err := writeManifest(manifestPath, docsCommit, codes); err != nil {
		log.Fatalf("write manifest: %v", err)
	}

	log.Printf("wrote %d pbjs schemas under %s (skipped %d non-bidder rows)", len(codes), pbjsDir, skipped)
	log.Printf("prebid.github.io @ %s", docsCommit)
}

func writePbjsSchema(dir, code string, info bidderInfo) error {
	title := info.Title
	if title == "" {
		title = code
	}
	schema := map[string]any{
		"$schema":     "http://json-schema.org/draft-07/schema#",
		"$id":         fmt.Sprintf("https://prebid.org/schemas/pbjs/%s.json", code),
		"title":       fmt.Sprintf("%s bidder params (Prebid.js)", title),
		"description": fmt.Sprintf("Generated from prebid.github.io %s (%s). Table-derived constraints are not yet applied; params object is accepted.", docsSubdir, info.File),
		"type":        "object",
		"additionalProperties": true,
	}
	raw, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	path := filepath.Join(dir, code+".json")
	return os.WriteFile(path, raw, 0o644)
}

type manifestDoc struct {
	Version string `json:"version"`
	Sources map[string]sourceInfo `json:"sources"`
	Bidders map[string]bidderManifest `json:"bidders"`
}

type sourceInfo struct {
	Repo   string `json:"repo"`
	Path   string `json:"path"`
	Commit *string `json:"commit"`
	Note   string `json:"note,omitempty"`
}

type bidderManifest struct {
	Pbjs *schemaRef `json:"pbjs"`
	Pbs  *schemaRef `json:"pbs"`
}

type schemaRef struct {
	Schema string `json:"schema"`
}

func cleanupPbjs(dir string, keep map[string]struct{}) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		base := strings.TrimSuffix(name, filepath.Ext(name))
		if _, ok := keep[base]; ok {
			continue
		}
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			return err
		}
	}
	return nil
}

func writeManifest(path, docsCommit string, codes []string) error {
	commit := docsCommit
	m := manifestDoc{
		Version: "0.1.0",
		Sources: map[string]sourceInfo{
			"prebid_github_io": {
				Repo:   "https://github.com/prebid/prebid.github.io",
				Path:   "dev-docs",
				Commit: &commit,
				Note:   "Updated by tools/sync-prebid-docs from dev-docs/bidders.",
			},
			"prebid_server": {
				Repo:   "https://github.com/prebid/prebid-server",
				Path:   "adapters",
				Commit: nil,
				Note:   "Pin commit when generating PBS-oriented schemas.",
			},
		},
		Bidders: map[string]bidderManifest{},
	}

	for _, code := range codes {
		m.Bidders[code] = bidderManifest{
			Pbjs: &schemaRef{Schema: fmt.Sprintf("pbjs/%s.json", code)},
			Pbs:  nil,
		}
	}

	m.Bidders["ci_fixture"] = bidderManifest{
		Pbjs: &schemaRef{Schema: "pbjs/ci_fixture.json"},
		Pbs:  nil,
	}

	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return os.WriteFile(path, raw, 0o644)
}
