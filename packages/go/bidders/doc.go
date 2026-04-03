// Package bidders provides typed Go structs for every Prebid bidder adapter,
// generated from the upstream JSON Schemas.
//
// Each struct corresponds to the params accepted by a specific bidder in a
// specific runtime (Prebid.js or Prebid Server). Struct names follow the
// pattern Pbjs<Bidder> and Pbs<Bidder>.
//
// These types are intended for constructing params with IDE autocomplete and
// documentation. Validation is still performed by the JSON Schema engine in
// the parent pbvalidator package.

//go:generate go run ../cmd/generate
package bidders
