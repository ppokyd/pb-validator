package main

import "testing"

func TestParseYAMLFrontMatter(t *testing.T) {
	src := []byte(`---
layout: bidder
biddercode: appnexus
title: AppNexus
---

### Hello
`)
	doc, err := parseYAMLFrontMatter(src)
	if err != nil {
		t.Fatal(err)
	}
	if !layoutIsBidder(doc) {
		t.Fatal("expected bidder layout")
	}
	code, ok := bidderCode(doc)
	if !ok || code != "appnexus" {
		t.Fatalf("biddercode: got %q ok=%v", code, ok)
	}
}
