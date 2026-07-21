# API Endpoints

Structured book metadata API. Goodreads HTML scraping has been removed from book routes. Default mode is **aggregate** (all registered providers; currently **Hardcover** only).

## Base URL

All endpoints are prefixed with `/api`.

---

## 1. Search Books

Search for books by title, author, or ISBN.

- **Endpoint**: `GET /api/book/search`
- **Query parameters**:
  - `query` (required): Search string
  - `type` (optional): `all` (default) \| `title` \| `author` \| `isbn`
  - `limit` (optional): 1–50 (default 10)
  - `provider` (optional):
    - omit or `aggregate` — multi-source default (registered providers only)
    - `hardcover` — Hardcover only
    - `goodreads` — **400** (removed)

### Example

```
GET /api/book/search?query=fourth+wing
GET /api/book/search?query=9781649374042&provider=hardcover&type=isbn
```

### Response

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

Empty search results are not cached. Successful non-empty results are cached for about **1 day**.

---

## 2. Book Details

Retrieve detailed metadata for a book by provider id or slug.

- **Endpoint**: `GET /api/book/details/:slug`
- **Path**:
  - `slug`: Hardcover numeric id or slug
- **Query parameters**:
  - `provider` (optional): `aggregate` (default) \| `hardcover`
  - `editionId` (optional): positive integer Hardcover edition id (from ISBN search)
  - `reviews=true` is **no longer supported** (returns **400**)

### Example

```
GET /api/book/details/1662524
GET /api/book/details/the-alchemist?provider=hardcover
GET /api/book/details/1662524?provider=hardcover&editionId=32963227
```

### Response

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "https://hardcover.app/books/...",
  "book": {
    "provider": "hardcover",
    "title": "...",
    "cover": "...",
    "author": [{ "id": 1, "name": "...", "url": "..." }],
    "rating": "4.50",
    "publishDate": "...",
    "genres": ["..."],
    "isbn": "...",
    "isbn10": "..."
  }
}
```

Successful details responses are cached for about **14 days**.

---

## Removed endpoints

The following Goodreads HTML-backed endpoints have been **removed** (HTTP 404):

- `/api/author/*`
- `/api/user/*`
- Book lists, quotes, and review scrape endpoints

Use structured book search/details instead.

---

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Invalid params, removed `provider=goodreads`, or `reviews=true` |
| 404 | Book/edition not found |
| 429 | Abuse protection soft throttle |
| 503 | Provider not configured (e.g. missing `HARDCOVER_API_TOKEN`) |

---

## Caching & abuse

- Redis optional via `REDIS_URL`; kill switch `DISABLE_REDIS=true`
- Soft abuse limits: see README (`ABUSE_MAX_REQUESTS_PER_SECOND`, etc.)
