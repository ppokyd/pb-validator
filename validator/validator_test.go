package validator

import (
	"encoding/json"
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
