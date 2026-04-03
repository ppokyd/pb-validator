package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	pbvalidator "github.com/ppokyd/pb-validator/packages/go"
	"github.com/ppokyd/pb-validator/packages/go/bidders"
)

func main() {
	ctx := context.Background()
	client := pbvalidator.NewClient(pbvalidator.EmbeddedProvider())

	printSection("Manifest Info")
	manifest, err := client.LoadManifest(ctx)
	if err != nil {
		log.Fatalf("LoadManifest: %v", err)
	}
	fmt.Printf("Schema version : %s\n", manifest.Version)
	fmt.Printf("Total bidders  : %d\n", len(manifest.Bidders))

	printSection("List Bidders (first 10)")
	codes, err := client.ListBidders(ctx)
	if err != nil {
		log.Fatalf("ListBidders: %v", err)
	}
	limit := 10
	if len(codes) < limit {
		limit = len(codes)
	}
	for i, code := range codes[:limit] {
		fmt.Printf("  %2d. %s\n", i+1, code)
	}
	fmt.Printf("  ... and %d more\n", len(codes)-limit)

	printSection("Validate with map[string]any (valid)")
	res, err := client.Validate(ctx, pbvalidator.RuntimePbjs, "appnexus", map[string]any{
		"placementId": float64(12345),
	})
	if err != nil {
		log.Fatalf("Validate: %v", err)
	}
	printResult("pbjs / appnexus", res)

	printSection("Validate with map[string]any (invalid — missing required field)")
	res, err = client.Validate(ctx, pbvalidator.RuntimePbjs, "appnexus", map[string]any{})
	if err != nil {
		log.Fatalf("Validate: %v", err)
	}
	printResult("pbjs / appnexus (empty params)", res)

	printSection("Validate with typed struct (valid)")
	rubiconParams := bidders.PbsRubicon{
		AccountId: 1001,
		SiteId:    113,
		ZoneId:    535510,
	}
	res, err = client.Validate(ctx, pbvalidator.RuntimePbs, "rubicon", rubiconParams)
	if err != nil {
		log.Fatalf("Validate: %v", err)
	}
	printResult("pbs / rubicon", res)

	printSection("Validate with typed struct (invalid — zero values)")
	res, err = client.Validate(ctx, pbvalidator.RuntimePbs, "rubicon", bidders.PbsRubicon{})
	if err != nil {
		log.Fatalf("Validate: %v", err)
	}
	printResult("pbs / rubicon (zero values)", res)

	printSection("Get Bidder Schema (pbjs / appnexus)")
	schemaData, err := client.GetSchema(ctx, pbvalidator.RuntimePbjs, "appnexus")
	if err != nil {
		log.Fatalf("GetSchema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaData, &schema); err != nil {
		log.Fatalf("Unmarshal schema: %v", err)
	}
	fmt.Printf("  type       : %s\n", schema["type"])
	if desc, ok := schema["description"]; ok {
		fmt.Printf("  description: %s\n", desc)
	}
	if props, ok := schema["properties"].(map[string]any); ok {
		propNames := make([]string, 0, len(props))
		for k := range props {
			propNames = append(propNames, k)
		}
		fmt.Printf("  properties : %s\n", strings.Join(propNames, ", "))
	}
	pretty, _ := json.MarshalIndent(schema, "  ", "  ")
	fmt.Printf("  raw JSON   :\n  %s\n", pretty)

	printSection("Error handling — unknown bidder")
	_, err = client.Validate(ctx, pbvalidator.RuntimePbjs, "not_a_real_bidder", map[string]any{})
	if err != nil {
		fmt.Printf("  Got expected error: %v\n", err)
	}

	fmt.Println()
}

func printSection(title string) {
	fmt.Printf("\n── %s %s\n", title, strings.Repeat("─", max(0, 58-len(title))))
}

func printResult(label string, res *pbvalidator.ValidationResult) {
	if res.Valid {
		fmt.Printf("  [PASS] %s\n", label)
	} else {
		fmt.Printf("  [FAIL] %s\n", label)
		for _, e := range res.Errors {
			fmt.Printf("         - %s\n", e)
		}
	}
}
