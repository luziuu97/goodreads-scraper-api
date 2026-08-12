/**
 * Compatibility shim.
 *
 * All aggregation (search, details, covers, series) lives in
 * `lib/providers/aggregate`. Unversioned and v1 routes must not maintain a
 * second merge policy.
 */
export * from "@/lib/providers/aggregate";
