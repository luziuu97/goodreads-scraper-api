import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import {
  batchSearchBooksByProvider,
  parseProvider,
  type BatchSearchItemInput,
} from "@/lib/book-providers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    await API_CONFIG.publicRateLimit.checkBatch(req, "batch_search_books");
  } catch {
    console.warn(`[API /api/v1/book/batch-search] 429 Rate limit exceeded:`, {
      url: req.url,
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      userAgent: req.headers.get("user-agent"),
    });
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests. Batch search limit is 5 requests per 10 seconds." },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const { items, provider: providerParam } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'items' array" },
        { status: 400 }
      );
    }

    if (items.length > 50) {
      return NextResponse.json(
        { error: "Batch size limit exceeded. Maximum 50 items allowed per request." },
        { status: 400 }
      );
    }

    const provider = parseProvider(providerParam);
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    console.log(`[API /api/v1/book/batch-search] Received request for ${items.length} item(s):`, {
      provider,
      items: items.map((item: any, idx: number) => ({
        index: idx,
        query: item.query || undefined,
        isbn: item.isbn || undefined,
        title: item.title || undefined,
        author: item.author || undefined,
        type: item.type || undefined,
        language: item.language || undefined,
        limit: item.limit || undefined,
      })),
      ip,
    });

    const batchResults = await batchSearchBooksByProvider({
      provider,
      items: items as BatchSearchItemInput[],
    });

    const durationMs = Date.now() - startTime;
    console.log(`[API /api/v1/book/batch-search] Completed in ${durationMs}ms (${batchResults.successfulItems}/${batchResults.totalItems} successful):`, {
      provider,
      totalItems: batchResults.totalItems,
      successfulItems: batchResults.successfulItems,
      failedItems: batchResults.failedItems,
    });

    const response = NextResponse.json(batchResults);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown batch search error";
    const stack = error instanceof Error ? error.stack : undefined;
    const status =
      message.includes("Invalid provider parameter")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : 500;

    console.error(`[API /api/v1/book/batch-search] Error ${status} (${durationMs}ms):`, {
      url: req.url,
      error: message,
      stack,
    });

    const errorResponse = NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return errorResponse;
  }
}
