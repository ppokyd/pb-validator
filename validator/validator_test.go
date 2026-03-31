package validator

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestValidateAppnexusPbjs(t *testing.T) {
	params := json.RawMessage(`{"placementId":12345}`)
	res, err := Validate(RuntimePbjs, "appnexus", params)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got %v", res.Errors)
	}
}

func TestValidateUnknownBidder(t *testing.T) {
	_, err := Validate(RuntimePbjs, "not-a-real-bidder", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateCiFixturePbjsRejectsMissingToken(t *testing.T) {
	res, err := Validate(RuntimePbjs, "ci_fixture", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if res.Valid {
		t.Fatal("expected invalid")
	}
	if len(res.Errors) == 0 {
		t.Fatal("expected validation errors")
	}
}

func TestValidateCiFixturePbjsAcceptsToken(t *testing.T) {
	res, err := Validate(RuntimePbjs, "ci_fixture", json.RawMessage(`{"token":"x"}`))
	if err != nil {
		t.Fatal(err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got %v", res.Errors)
	}
}

func TestGetSchemaPbjs(t *testing.T) {
	raw, err := GetSchema(RuntimePbjs, "ci_fixture")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if doc["type"] != "object" {
		t.Fatalf("unexpected schema: %v", doc["type"])
	}
}

func TestListBiddersSorted(t *testing.T) {
	got, err := ListBidders()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.IsSorted(got) {
		t.Fatalf("expected sorted bidders: %v", got)
	}
}

func TestPbsMissingSchemaReturnsError(t *testing.T) {
	_, err := Validate(RuntimePbs, "appnexus", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error for missing pbs schema")
	}
}
