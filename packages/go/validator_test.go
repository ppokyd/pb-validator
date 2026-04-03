package pbvalidator_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	pbvalidator "github.com/ppokyd/pb-validator/packages/go"
	"github.com/ppokyd/pb-validator/packages/go/bidders"
)

func schemasDir() string {
	return filepath.Join("..", "..", "schemas")
}

func newTestClient() *pbvalidator.Client {
	return pbvalidator.NewClient(pbvalidator.NewFSProvider(schemasDir()))
}

func TestValidateAppnexusPbjsParams(t *testing.T) {
	client := newTestClient()
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "appnexus", map[string]any{
		"placementId": float64(12345),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func TestCIFixtureRejectsMissingToken(t *testing.T) {
	client := newTestClient()
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "ci_fixture", map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid, got valid")
	}
	if len(res.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
}

func TestCIFixtureAcceptsToken(t *testing.T) {
	client := newTestClient()
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "ci_fixture", map[string]any{
		"token": "x",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func TestGetSchemaReturnsObjectSchema(t *testing.T) {
	client := newTestClient()
	data, err := client.GetSchema(context.Background(), pbvalidator.RuntimePbjs, "ci_fixture")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatalf("failed to parse schema: %v", err)
	}
	if schema["type"] != "object" {
		t.Fatalf("expected type=object, got %v", schema["type"])
	}
}

func TestLoadManifestHasVersionAndBidders(t *testing.T) {
	client := newTestClient()
	m, err := client.LoadManifest(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.Version == "" {
		t.Fatal("expected non-empty version")
	}
	if _, ok := m.Bidders["appnexus"]; !ok {
		t.Fatal("expected appnexus in bidders")
	}
	if _, ok := m.Bidders["ci_fixture"]; !ok {
		t.Fatal("expected ci_fixture in bidders")
	}
}

func TestListBiddersIsSorted(t *testing.T) {
	client := newTestClient()
	codes, err := client.ListBidders(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !sort.StringsAreSorted(codes) {
		t.Fatal("expected sorted bidder list")
	}
	found := false
	for _, c := range codes {
		if c == "appnexus" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected appnexus in bidder list")
	}
}

func TestUnknownBidderReturnsError(t *testing.T) {
	client := newTestClient()
	_, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "not-a-real-bidder", map[string]any{})
	if err == nil {
		t.Fatal("expected error for unknown bidder")
	}
	if !errors.Is(err, pbvalidator.ErrUnknownBidder) {
		t.Fatalf("expected ErrUnknownBidder, got: %v", err)
	}
}

func TestPbsMissingSchemaReturnsError(t *testing.T) {
	client := newTestClient()
	_, err := client.Validate(context.Background(), pbvalidator.RuntimePbs, "1accord", map[string]any{})
	if err == nil {
		t.Fatal("expected error for missing pbs schema")
	}
	if matched := errors.Is(err, pbvalidator.ErrNoSchema) || strings.Contains(err.Error(), "no pbs schema"); !matched {
		t.Fatalf("expected 'no pbs schema' error, got: %v", err)
	}
}

// --- Embedded provider tests ---

func newEmbeddedClient() *pbvalidator.Client {
	return pbvalidator.NewClient(pbvalidator.EmbeddedProvider())
}

func TestEmbeddedProviderLoadManifest(t *testing.T) {
	client := newEmbeddedClient()
	m, err := client.LoadManifest(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.Version == "" {
		t.Fatal("expected non-empty version")
	}
	if _, ok := m.Bidders["appnexus"]; !ok {
		t.Fatal("expected appnexus in bidders")
	}
}

func TestEmbeddedProviderValidate(t *testing.T) {
	client := newEmbeddedClient()
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "appnexus", map[string]any{
		"placementId": float64(12345),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func TestEmbeddedProviderListBidders(t *testing.T) {
	client := newEmbeddedClient()
	codes, err := client.ListBidders(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !sort.StringsAreSorted(codes) {
		t.Fatal("expected sorted bidder list")
	}
	if !containsStr(codes, "appnexus") {
		t.Fatal("expected appnexus in list")
	}
}

// --- Typed struct validation tests ---

func TestTypedStructPbsRubiconValid(t *testing.T) {
	client := newEmbeddedClient()
	params := bidders.PbsRubicon{
		AccountId: 1001,
		SiteId:    1,
		ZoneId:    1,
	}
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbs, "rubicon", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func TestTypedStructPbjsCIFixtureValid(t *testing.T) {
	client := newEmbeddedClient()
	params := bidders.PbjsCiFixture{
		Token: "abc",
	}
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "ci_fixture", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func TestTypedStructPbjsCIFixtureInvalid(t *testing.T) {
	client := newEmbeddedClient()
	params := bidders.PbjsCiFixture{}
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "ci_fixture", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid, got valid")
	}
	if len(res.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
}

func TestTypedStructPbjsAppnexusValid(t *testing.T) {
	client := newEmbeddedClient()
	placementID := int64(12345)
	params := bidders.PbjsAppnexus{
		PlacementId: &placementID,
	}
	res, err := client.Validate(context.Background(), pbvalidator.RuntimePbjs, "appnexus", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got errors: %v", res.Errors)
	}
}

func containsStr(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

