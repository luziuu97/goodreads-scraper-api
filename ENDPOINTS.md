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
    "translator": null,
    "translators": [],
    "illustrators": [],
    "narrators": [],
    "editors": [],
    "otherContributors": [],
    "rating": "4.50",
    "publishDate": "...",
    "genres": ["..."],
    "isbn": "...",
    "isbn10": "...",
    "language": "English",
    "languageCode": "en",
    "country": "United States of America",
    "countryCode": "us",
    "pages": 517,
    "publishedBy": "Red Tower Books",
    "edition": {
      "id": 32963227,
      "isbn": "...",
      "pages": 517,
      "publisher": "Red Tower Books",
      "language": "English",
      "languageCode": "en",
      "country": "United States of America",
      "countryCode": "us"
    }
  }
}
```

When `editionId` is provided (e.g. from an ISBN search hit), edition-specific fields (`pages`, `isbn`, `language`, `country`, `publisher`, `publishDate`, `type`, cover, and role-split contributors) match that edition. Translators, illustrators, narrators, and editors are returned in their own arrays — not mixed into `author`.

Successful details responses are cached for about **14 days**.

---

## 3. Book Covers

List edition covers for a book, including image metadata from Hardcover (width, height, ratio, dominant color) so clients can show a gallery and pick the best resolution.

- **Endpoint**: `GET /api/book/covers/:slug`
- **Path**:
  - `slug`: Hardcover numeric id or slug
- **Query parameters**:
  - `provider` (optional): `aggregate` (default) \| `hardcover`
  - `limit` (optional): 1–100 (default 50) — max editions to fetch
  - `onlyWithCover` (optional): `true` (default) \| `false` — omit editions without a cover URL

### Example

```
GET /api/book/covers/1662524
GET /api/book/covers/fourth-wing?provider=hardcover&limit=50
GET /api/book/covers/1662524?onlyWithCover=false
```

### Response

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "https://hardcover.app/books/fourth-wing",
  "book": {
    "id": "1662524",
    "slug": "fourth-wing",
    "title": "Fourth Wing",
    "provider": "hardcover"
  },
  "covers": [
    {
      "editionId": 32963227,
      "title": "Fourth Wing",
      "url": "https://...",
      "width": 1200,
      "height": 1800,
      "ratio": 0.6667,
      "color": "#2a1f3d",
      "pixelCount": 2160000,
      "imageId": 98765,
      "format": "Hardcover",
      "isbn": "9781649374042",
      "isbn10": "1649374046",
      "asin": null,
      "publicationDate": "2023-05-02",
      "pages": 517,
      "publisher": "Red Tower Books",
      "language": "English",
      "languageCode": "en",
      "country": "United States of America",
      "countryCode": "us",
      "isDefault": true
    }
  ],
  "bestByResolution": {
    "editionId": 32963227,
    "url": "https://...",
    "width": 1200,
    "height": 1800,
    "pixelCount": 2160000
  },
  "totalCovers": 1,
  "totalEditions": 24
}
```

Covers are sorted by `pixelCount` descending (unknown dimensions last). On ties, the default cover edition is preferred. Successful responses are cached for about **30 days**.

---

## 4. Book Formats

List editions/formats for a book from **Hardcover only** (no `provider` parameter). Filter by language and/or format.

- **Endpoint**: `GET /api/book/formats/:slug`
- **Path**:
  - `slug`: Hardcover numeric id or slug
- **Query parameters**:
  - `language` (optional): ISO code (`en`, `es`, …), `original` (majority language among editions), or omit for all languages
  - `format` (optional): `ebook` \| `audiobook` \| `hardcover` \| `paperback` \| `physical` (`physical` = hardcover or paperback)
  - `limit` (optional): 1–100 (default 50) — max matched editions after filtering

### Example

```
GET /api/book/formats/fourth-wing
GET /api/book/formats/fourth-wing?language=en&format=ebook
GET /api/book/formats/714600?language=original
GET /api/book/formats/fourth-wing?language=es&format=paperback
GET /api/book/formats/fourth-wing?format=hardcover
GET /api/book/formats/fourth-wing?format=physical
```

### Response

```json
{
  "success": true,
  "scrapedURL": "https://hardcover.app/books/fourth-wing",
  "book": {
    "id": "714600",
    "slug": "fourth-wing",
    "title": "Fourth Wing"
  },
  "formats": [
    {
      "editionId": 31440211,
      "title": "Fourth Wing",
      "format": "ebook",
      "formatLabel": "Kindle",
      "editionFormat": "Kindle",
      "readingFormat": "Ebook",
      "language": "English",
      "languageCode": "en",
      "country": "United States of America",
      "countryCode": "us",
      "isbn": null,
      "isbn10": null,
      "asin": "B0BGHCXCYB",
      "pages": 517,
      "publicationDate": "2023-05-02",
      "publisher": "Red Tower Books",
      "cover": "https://...",
      "usersCount": 12000
    }
  ],
  "filters": {
    "language": "en",
    "resolvedLanguage": "en",
    "originalLanguage": "en",
    "format": "ebook"
  },
  "availableLanguages": [
    { "code": "en", "name": "English" },
    { "code": "es", "name": "Spanish; Castilian" }
  ],
  "availableFormats": ["audiobook", "ebook", "hardcover", "paperback"],
  "totalEditions": 78,
  "totalMatched": 1
}
```

Editions are ordered by Hardcover `users_count` descending. Successful responses are cached for about **30 days** (cache key includes language, format, and limit).

---

## 5. Search Series

Search for book series by name. Returns **series-shaped** results (not books).

- **Endpoint**: `GET /api/series/search`
- **Query parameters**:
  - `query` (required): Series name search string
  - `limit` (optional): 1–50 (default 10)
  - `provider` (optional): `aggregate` (default) \| `hardcover`

### Example

```
GET /api/series/search?query=The+Empyrean
GET /api/series/search?query=Empyrean&provider=hardcover&limit=10
```

### Response

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "The Empyrean",
    "totalResults": 1,
    "series": [
      {
        "id": "41764",
        "provider": "hardcover",
        "name": "The Empyrean",
        "slug": "the-empyrean",
        "author": "Rebecca Yarros",
        "booksCount": 12,
        "primaryBooksCount": 3,
        "readersCount": 120000,
        "sampleBooks": ["Fourth Wing", "Iron Flame"]
      }
    ]
  }
}
```

Empty series search results are not cached. Successful non-empty results are cached for about **1 day**.

---

## 6. Series Details

Retrieve series metadata and its ordered books. Use `limit` / `offset` to page through long series lists.

By default, results are **deduped to one book per series position** in the series’ **original language** (inferred from featured primary editions). Use `language` / `format` to refine.

- **Endpoint**: `GET /api/series/:slug`
- **Path**:
  - `slug`: Hardcover numeric id or slug
- **Query parameters**:
  - `provider` (optional): `aggregate` (default) \| `hardcover`
  - `limit` (optional): 1–100 (default 50)
  - `offset` (optional): non-negative integer (default 0)
  - `language` (optional): ISO code (`en`, `es`, …) or `original` (**default**). Original = majority language among featured non-compilation books.
  - `format` (optional): `ebook` \| `audiobook` \| `hardcover` \| `paperback` \| `physical` — prefer editions of that format (`physical` = hardcover or paperback)

### Example

```
GET /api/series/the-empyrean
GET /api/series/percy-jackson-and-the-olympians
GET /api/series/percy-jackson-and-the-olympians?language=es
GET /api/series/percy-jackson-and-the-olympians?language=en&format=ebook
GET /api/series/41764?provider=hardcover&limit=50&offset=0
```

### Response

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "https://hardcover.app/series/the-empyrean",
  "series": {
    "id": "41764",
    "slug": "the-empyrean",
    "name": "The Empyrean",
    "description": null,
    "booksCount": 12,
    "primaryBooksCount": 3,
    "isCompleted": false,
    "author": {
      "id": 252677,
      "name": "Rebecca Yarros",
      "url": "https://hardcover.app/authors/rebecca-yarros"
    },
    "provider": "hardcover"
  },
  "books": [
    {
      "id": "714600",
      "slug": "fourth-wing",
      "title": "Fourth Wing",
      "author": "Rebecca Yarros",
      "cover": "https://...",
      "rating": 4.58,
      "publicationDate": "2023-05-02",
      "position": 1,
      "positionLabel": "1",
      "featured": true,
      "compilation": false,
      "languageCode": "en",
      "language": "English",
      "format": "hardcover",
      "formatLabel": "Hardcover"
    }
  ],
  "filters": {
    "language": "original",
    "resolvedLanguage": "en",
    "originalLanguage": "en",
    "format": null,
    "dedupedByPosition": true
  },
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 12,
    "total": 12
  }
}
```

When `language=es`, titles/covers prefer Spanish editions when Hardcover has them (even if the work id is the English book). Compilations and alternate-language translations at the same position are filtered out under the default original-language mode.

Successful series details responses are cached for about **14 days** (cache key includes language/format).

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
- Successful responses are cached (logical keys include filter params):

| Endpoint | TTL |
|----------|-----|
| Book / series search (≥1 hit) | ~1 day |
| Book details, series details | ~14 days |
| Book covers, book formats | ~30 days |
| Empty search / errors | not cached |
