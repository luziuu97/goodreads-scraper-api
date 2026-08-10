import { getRegisteredProviderIds } from "@/lib/providers/registry";
import type { BookProviderMode, ProviderId } from "@/lib/providers/types";

const VALID_MODES = new Set<string>(["aggregate"]);

function refreshValidModes(): Set<string> {
  const modes = new Set<string>(["aggregate"]);
  for (const id of getRegisteredProviderIds()) {
    modes.add(id);
  }
  return modes;
}

/**
 * Parse public provider query param.
 * - null / empty / "aggregate" → aggregate (all registered active providers)
 * - registered provider id → that provider only
 * - "goodreads" → fall back to "hardcover" for legacy API compatibility
 * - anything else → invalid provider error
 */
export function parseProvider(value: string | null): BookProviderMode {
  const raw = value?.trim().toLowerCase() ?? "";

  if (!raw || raw === "aggregate") {
    return "aggregate";
  }

  if (raw === "goodreads" || raw === "goodreads-dataset") {
    return "goodreads";
  }

  const modes = refreshValidModes();
  if (modes.has(raw) && raw !== "aggregate") {
    return raw as ProviderId;
  }

  const registered = getRegisteredProviderIds().join(", ");
  throw new Error(
    `Invalid provider parameter. Valid options: aggregate, ${registered}.`
  );
}

