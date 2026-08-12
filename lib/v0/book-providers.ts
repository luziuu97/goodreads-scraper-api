/**
 * Compatibility shim for older imports.
 *
 * Public `/api/*` routes and `/api/v1/*` aliases share one backend
 * (`lib/book-providers` → `lib/providers/aggregate`).
 */
export * from "@/lib/book-providers";
