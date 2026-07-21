# Goodreads Scraper API (Book Metadata)

![API Status](https://img.shields.io/badge/status-operational-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A modern REST API for **structured book metadata**. Goodreads HTML scraping has been removed from the book search/details path. Data is served through a **provider registry**; today the only registered provider is **Hardcover**, with an **aggregate** default that queries all registered providers.

### Base URL

```
https://gdscraper.bookishnearby.com
```

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/book/search` | GET | Search books by title, author, or ISBN |
| `/api/book/details/:slug` | GET | Get detailed book metadata by provider id/slug |

Author, user, reviews, lists, and quotes endpoints that depended on Goodreads HTML scraping have been **removed**.

## Providers

| Provider | Status | Notes |
|----------|--------|--------|
| `aggregate` (default) | Active | Runs all registered structured providers and merges results. Currently = Hardcover. |
| `hardcover` | Active | Hardcover GraphQL API. Requires `HARDCOVER_API_TOKEN`. |
| `goodreads` | Removed | Returns **400** with a deprecation message. |
| Open Library / Google Books / OpenAI | Not registered | Folder structure supports adding them later under `lib/providers/`. |

When **no** `provider` query param is passed, the API uses **aggregate**. When `provider=hardcover` is set, only Hardcover is used.

## Quick Start

### Search for books (aggregate default)

```javascript
const searchQuery = "fourth wing";

fetch(
  `https://gdscraper.bookishnearby.com/api/book/search?query=${encodeURIComponent(searchQuery)}&limit=20`
)
  .then((response) => response.json())
  .then((data) => console.log(data));
```

### Search with explicit Hardcover

```javascript
fetch(
  `https://gdscraper.bookishnearby.com/api/book/search?query=${encodeURIComponent(searchQuery)}&provider=hardcover&limit=20`
);
```

When a Hardcover search query is an ISBN, results may include a matched `edition` object. Pass `edition.id` to details:

```javascript
fetch(
  `https://gdscraper.bookishnearby.com/api/book/details/${book.id}?provider=hardcover&editionId=${book.edition.id}`
);
```

### Get book details

```javascript
fetch(`https://gdscraper.bookishnearby.com/api/book/details/${encodeURIComponent(bookIdOrSlug)}`)
  .then((response) => response.json())
  .then((data) => console.log(data));
```

## Response shape (search)

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "fourth wing",
    "totalResults": 1,
    "books": [
      {
        "id": "1662524",
        "provider": "hardcover",
        "title": "Fourth Wing",
        "author": "Rebecca Yarros",
        "cover": "https://...",
        "rating": 4.58,
        "publicationDate": "2023-05-02",
        "genres": ["Fantasy"]
      }
    ]
  }
}
```

## Rate limits / abuse control

This API is free to use. Public book endpoints use **lightweight abuse controls**, not a strict low daily quota:

- Normal usage of at least **~1 request per second** per IP is allowed
- Soft **429** only for clear burst abuse or suspicious automated traffic
- Configure with `ABUSE_MAX_REQUESTS_PER_SECOND` (default 15) and `ABUSE_MAX_REQUESTS_PER_10S` (default 60)
- Empty / missing user-agents may use a stricter burst budget

### Self-hosting

```bash
git clone https://github.com/ekamid/goodreads-scraper-api.git
cd goodreads-scraper-api
npm install
npm run dev
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HARDCOVER_API_TOKEN` | Yes (for live data) | Hardcover GraphQL API token |
| `REDIS_URL` | No | Enables shared Redis response caching |
| `DISABLE_REDIS` | No | Set `true` to disable Redis even if `REDIS_URL` is set |
| `ABUSE_MAX_REQUESTS_PER_SECOND` | No | Burst ceiling per IP (default 15) |
| `ABUSE_MAX_REQUESTS_PER_10S` | No | Sliding 10s ceiling per IP (default 60) |
| `ABUSE_STRICT_EMPTY_UA` | No | Stricter limits for empty UA (default true) |
| `NEXT_PUBLIC_BASE_URL` | No | Docs / playground base URL |

## Redis cache

Successful provider responses are cached aggressively:

| Data | Cached? | TTL |
|------|---------|-----|
| Search with ≥1 result | Yes | ~1 day |
| Empty search | No | — |
| Successful book details | Yes | ~14 days |
| Errors / 4xx / 5xx | No | — |

Cache keys are normalized (sorted params, lowercased query/provider) so equivalent requests share one entry. Set `DISABLE_REDIS=true` to turn caching off at runtime.

## Provider architecture

```
lib/providers/
  types.ts           # BookDataProvider interface
  registry.ts        # ACTIVE_PROVIDERS list
  aggregate.ts       # multi-source merge
  parse-provider.ts  # public provider query parsing
  hardcover/         # sole registered provider today
```

To add a provider later: implement `BookDataProvider` under `lib/providers/<name>/` and register it in `registry.ts`. Routes do not need to change.

## Documentation

For interactive docs, visit `/docs` on a running instance.

## About

Originally built as an alternative after Goodreads deprecated their official API. Book metadata now comes from structured providers (Hardcover) instead of HTML scraping.

This project was built as part of [Nearby Bookish](https://bookishnearby.com).

## License

MIT

## Disclaimer

This API is not affiliated with Goodreads, Amazon, or Hardcover. Use third-party data sources in accordance with their terms of service.
