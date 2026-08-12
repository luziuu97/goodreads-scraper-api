# Goodreads Scraper API — Client Reference

This document describes the public endpoints. There is one API at `/api`. `/api/v1` is a temporary alias of the same routes and should not be treated as a second contract.

The default engine uses the canonical Goodreads-derived database first and can fall back to configured metadata providers. Pin `provider=hardcover` (or another provider) to get that source’s live object.

## Quick start

Replace `https://api.example.com` with the deployed API origin.

```text
Base URL: https://api.example.com/api
Content type: application/json
Authentication: none
```

All responses are JSON. For query strings, URL-encode parameter values. Unless a provider is explicitly required, omit `provider` and use the default `aggregate` mode.

### Provider values

The endpoints that accept `provider` support these values:

| Value | Meaning |
| --- | --- |
| `aggregate` | Default. Uses the canonical database and configured fallback providers. |
| `goodreads` | Pins the request to the Goodreads-derived provider backed by the canonical database. |
| `hardcover` | Pins the request to Hardcover. |
| `isbndb` | Pins the request to ISBNDB. Book endpoints only. |
| `openlibrary` | Pins the request to Open Library. Book endpoints only. |

The provider named in the top-level response is the requested dispatch mode. Individual records can name the source that supplied them; records read directly from the v1 database use `canonical`.

### Common status codes

| Status | Meaning |
| --- | --- |
| `200` | Request completed successfully. An empty search is still a successful request. |
| `400` | Missing or invalid path, query, or body input. |
| `404` | The requested book, edition, or series was not found. |
| `429` | Public rate limit exceeded. Retry with backoff. |
| `500` | Unexpected server error. |
| `503` | A required external provider is not configured or available. |

Error bodies usually use one of these forms:

```json
{ "error": "Query parameter is required" }
```

```json
{
  "success": false,
  "status": "Error - Invalid Query",
  "error": "Book not found"
}
```

Clients should primarily branch on the HTTP status and treat `error` as a human-readable diagnostic. The exact error shape varies slightly by endpoint.

---

## 1. Search books

```http
GET /api/book/search
```

Searches by title, author, ISBN, or translated edition title.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Query | `query` | string | Yes | — | Title, author, ISBN, or combined search text. |
| Query | `type` | string | No | `all` | One of `all`, `title`, `author`, or `isbn`. |
| Query | `language` | string | No | English presentation preference | ISO language code such as `en` or `es`. When supplied, results must have an edition in this language. When omitted, translated-title matches are preserved and otherwise an English edition is preferred when available. |
| Query | `provider` | string | No | `aggregate` | Provider mode described above. |
| Query | `limit` | integer | No | `10` | Number of results, from 1 to 50. |

```bash
curl "https://api.example.com/api/book/search?query=Juego%20de%20Tronos&language=es&limit=10"
```

### Successful response

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "Juego de Tronos",
    "totalResults": 1,
    "books": [
      {
        "id": "644",
        "provider": "canonical",
        "title": "Juego de Tronos",
        "workTitle": "A Game of Thrones",
        "author": "George R.R. Martin",
        "cover": "https://images.example.com/game-of-thrones-es.jpg",
        "rating": 4.45,
        "publicationDate": "1996-01-01",
        "genres": ["Fantasy", "Fiction"],
        "isbn": "9788496208926",
        "isbn10": "8496208923",
        "language": "Spanish; Castilian",
        "languageCode": "es",
        "translators": ["Cristina Macía"],
        "presentation": "edition",
        "edition": {
          "id": 15086528,
          "title": "Juego de tronos",
          "isbn": "9788496208926",
          "isbn10": "8496208923",
          "asin": null,
          "format": "paperback",
          "publicationDate": "2002-01-01",
          "pages": 790,
          "publisher": "Gigamesh, S.L.",
          "language": "Spanish; Castilian",
          "languageCode": "es",
          "country": "Spain",
          "countryCode": "es",
          "cover": "https://images.example.com/game-of-thrones-es.jpg"
        }
      }
    ]
  }
}
```

`title` is the presentation title. `workTitle` remains the canonical work title. `presentation` is `work`, `edition`, or `isbn` and explains why the displayed edition was chosen. When a provider returns a positive numeric `edition.id`, save it and pass it as `editionId` to the details endpoint to preserve that provider edition. Canonical records currently use `0` as the search-result edition ID; for those, open details with the work `id` or `slug` instead.

---

## 2. Batch search books

```http
POST /api/book/batch-search
Content-Type: application/json
```

Runs up to 50 book searches in one request. Results preserve input order and each item succeeds or fails independently.

### Request body

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | string | No | Provider mode. Defaults to `aggregate`. |
| `items` | array | Yes | Non-empty array containing no more than 50 search items. |

Each `items[]` object accepts:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `query` | string | Conditional | — | General search text. |
| `isbn` | string | Conditional | — | ISBN search value. Takes precedence over `query`. |
| `title` | string | Conditional | — | Title; combined with `author` when `query` and `isbn` are absent. |
| `author` | string | No | — | Author to combine with `title`. |
| `type` | string | No | `isbn` when `isbn` is set; otherwise `all` | `all`, `title`, `author`, or `isbn`. |
| `language` | string | No | — | ISO language code such as `en` or `es`. |
| `limit` | integer | No | `10` | Results for this item, clamped to 1–50. |

Every item must provide a non-empty `isbn`, `query`, or `title`/`author` combination.

```bash
curl -X POST "https://api.example.com/api/book/batch-search" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "aggregate",
    "items": [
      { "query": "Dune", "limit": 5 },
      { "isbn": "9780441172719" },
      { "title": "Foundation", "author": "Isaac Asimov" }
    ]
  }'
```

### Successful response

The HTTP request returns `200` even when one or more individual items fail. Inspect each result's `success` value.

```json
{
  "success": true,
  "provider": "aggregate",
  "totalItems": 3,
  "successfulItems": 2,
  "failedItems": 1,
  "results": [
    {
      "index": 0,
      "query": "Dune",
      "success": true,
      "books": [
        {
          "id": "1662524",
          "provider": "canonical",
          "title": "Dune",
          "workTitle": "Dune",
          "author": "Frank Herbert",
          "cover": "https://images.example.com/dune.jpg",
          "rating": 4.67,
          "publicationDate": "1965-08-01",
          "presentation": "work"
        }
      ]
    },
    {
      "index": 1,
      "query": "9780441172719",
      "success": true,
      "books": [
        {
          "id": "1662524",
          "provider": "canonical",
          "title": "Dune",
          "workTitle": "Dune",
          "author": "Frank Herbert",
          "cover": "https://images.example.com/dune-paperback.jpg",
          "isbn": "9780441172719",
          "presentation": "isbn"
        }
      ]
    },
    {
      "index": 2,
      "query": "",
      "success": false,
      "error": "Item must specify a query, isbn, or title/author"
    }
  ]
}
```

This endpoint has a separate limit of 5 batch requests per 10 seconds and is never response-cached as a whole.

---

## 3. Get book details

```http
GET /api/book/details/{slug}
```

Returns work-level metadata plus the selected edition and known editions. `{slug}` can be a canonical work ID or slug, a provider-specific identifier, or an ISBN that the selected provider can resolve.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Path | `slug` | string | Yes | — | Work ID, book slug, provider ID, or resolvable ISBN. |
| Query | `editionId` | integer | No | — | Positive edition ID from a search result. Selects that exact edition. |
| Query | `language` | string | No | — | Supported ISO code such as `en` or `es`; selects presentation and edition metadata in that language when available. |
| Query | `provider` | string | No | `aggregate` | Provider mode described above. |

The old `reviews=true` option is not supported and returns `400`.

```bash
curl "https://api.example.com/api/book/details/a-game-of-thrones?language=es"
```

### Successful response

The canonical response contains normalized work data. Nullable fields and arrays should be handled defensively because source records vary in completeness.

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://work/62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
  "book": {
    "id": "62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
    "slug": "a-game-of-thrones",
    "title": "Juego de Tronos",
    "canonicalTitle": "A Game of Thrones",
    "description": "En el legendario mundo de los Siete Reinos...",
    "descriptionLanguage": "es",
    "requestedLanguage": "es",
    "isLanguageFallback": false,
    "language": "es",
    "languageCode": "es",
    "author": "George R.R. Martin",
    "authors": [
      { "id": "author-1", "name": "George R.R. Martin", "role": "AUTHOR" }
    ],
    "translators": [
      { "id": "author-2", "name": "Cristina Macía", "role": "TRANSLATOR" }
    ],
    "illustrators": [],
    "narrators": [],
    "editors": [],
    "audioLength": null,
    "audioLengthMinutes": null,
    "rating": 4.45,
    "ratingsCount": 2540000,
    "publicationYear": 1996,
    "genres": ["Fantasy", "Fiction"],
    "matchedEdition": {
      "id": "edition-15086528",
      "title": "Juego de tronos",
      "format": "paperback",
      "language": "es",
      "isbn13": "9788496208926",
      "isbn10": "8496208923",
      "asin": null,
      "publisher": "Gigamesh, S.L.",
      "publicationDate": "2002-01-01",
      "pages": 790,
      "audioLengthMinutes": null,
      "cover": "https://images.example.com/game-of-thrones-es.jpg"
    },
    "editions": [
      {
        "id": "edition-15086528",
        "title": "Juego de tronos",
        "format": "paperback",
        "language": "es",
        "isbn13": "9788496208926",
        "isbn10": "8496208923",
        "asin": null,
        "publisher": "Gigamesh, S.L.",
        "publicationDate": "2002-01-01",
        "pages": 790,
        "audioLengthMinutes": null,
        "isDefault": false,
        "cover": "https://images.example.com/game-of-thrones-es.jpg"
      }
    ],
    "translations": [
      {
        "language": "es",
        "title": "Juego de Tronos",
        "description": "En el legendario mundo de los Siete Reinos..."
      }
    ]
  }
}
```

When an external provider supplies the result, `book` can include additional source-specific normalized fields such as `pages`, `isbn`, `publishedBy`, or role-split contributor arrays. Treat documented canonical fields as the preferred v1 contract and ignore unknown additions.

---

## 4. Get book covers

```http
GET /api/book/covers/{slug}
```

Returns edition covers, sorted by `pixelCount` descending when dimensions are known.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Path | `slug` | string | Yes | — | Book/work ID or slug. |
| Query | `provider` | string | No | `aggregate` | Provider mode described above. |
| Query | `limit` | integer | No | `50` | Maximum editions to inspect, from 1 to 100. |
| Query | `onlyWithCover` | boolean | No | `true` | When true, omit editions without a cover URL. Accepts `true`/`false`, `1`/`0`, `yes`/`no`, or `on`/`off`. |

```bash
curl "https://api.example.com/api/book/covers/fourth-wing?limit=50&onlyWithCover=true"
```

### Successful response

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://work/714600",
  "book": {
    "id": "714600",
    "slug": "fourth-wing",
    "title": "Fourth Wing",
    "provider": "canonical"
  },
  "covers": [
    {
      "editionId": 32963227,
      "title": "Fourth Wing",
      "url": "https://images.example.com/fourth-wing.jpg",
      "width": 1200,
      "height": 1800,
      "ratio": 0.6667,
      "color": "#2a1f3d",
      "pixelCount": 2160000,
      "imageId": 98765,
      "format": "hardcover",
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
    "url": "https://images.example.com/fourth-wing.jpg",
    "width": 1200,
    "height": 1800,
    "pixelCount": 2160000
  },
  "totalCovers": 1,
  "totalEditions": 24
}
```

`bestByResolution` is `null` when no usable cover exists. Image metadata such as dimensions and color can also be `null` when the source does not provide it.

---

## 5. Get book formats and editions

```http
GET /api/book/formats/{slug}
```

Lists editions for a book and optionally filters them by language and reading format. This endpoint does not accept a `provider` parameter; it reads the canonical database first and otherwise falls back to Hardcover.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Path | `slug` | string | Yes | — | Book/work ID or slug. |
| Query | `language` | string | No | all languages | ISO code such as `en` or `es`, or `original` for the work's original/majority language. |
| Query | `format` | string | No | all formats | `ebook`, `audiobook`, `hardcover`, `paperback`, or `physical`. `physical` includes hardcover and paperback. |
| Query | `limit` | integer | No | `50` | Maximum matching editions, from 1 to 100. |

```bash
curl "https://api.example.com/api/book/formats/fourth-wing?language=en&format=ebook&limit=20"
```

### Successful response

```json
{
  "success": true,
  "scrapedURL": "canonical://work/714600",
  "book": {
    "id": "714600",
    "slug": "fourth-wing",
    "title": "Fourth Wing"
  },
  "formats": [
    {
      "editionId": "31440211",
      "title": "Fourth Wing",
      "format": "ebook",
      "formatLabel": "EBOOK",
      "editionFormat": "EBOOK",
      "readingFormat": null,
      "language": "en",
      "languageCode": "en",
      "country": null,
      "countryCode": null,
      "isbn": null,
      "isbn10": null,
      "asin": "B0BGHCXCYB",
      "pages": 517,
      "publicationDate": "2023-05-02",
      "publisher": "Red Tower Books",
      "cover": "https://images.example.com/fourth-wing-ebook.jpg",
      "usersCount": null
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

`availableLanguages` and `availableFormats` describe the unfiltered work and can be used to build filter controls. Some external-source fields can be `null` when the canonical dataset has no equivalent.

---

## 6. Search series

```http
GET /api/series/search
```

Searches for a series by name.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Query | `query` | string | Yes | — | Series name. |
| Query | `provider` | string | No | `aggregate` | Provider mode. `aggregate`, `goodreads`, and `hardcover` are the useful series modes. |
| Query | `limit` | integer | No | `10` | Number of results, from 1 to 50. |

```bash
curl "https://api.example.com/api/series/search?query=The%20Empyrean&limit=10"
```

### Successful response

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
        "provider": "canonical",
        "name": "The Empyrean",
        "slug": "the-empyrean",
        "author": "Rebecca Yarros",
        "booksCount": 12,
        "primaryBooksCount": 3,
        "readersCount": 120000,
        "sampleBooks": ["Fourth Wing", "Iron Flame", "Onyx Storm"]
      }
    ]
  }
}
```

Optional properties can be absent when the source does not have them. Use `slug` to fetch series details.

---

## 7. Get series details

```http
GET /api/series/{slug}
```

Returns series metadata and an ordered, filterable, paginated list of books.

### Request

| Location | Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- | --- |
| Path | `slug` | string | Yes | — | Series ID or slug returned by series search. |
| Query | `provider` | string | No | `aggregate` | Provider mode. `aggregate`, `goodreads`, and `hardcover` are the useful series modes. |
| Query | `limit` | integer | No | `50` | Maximum books to return, from 1 to 100. |
| Query | `offset` | integer | No | `0` | Non-negative offset into the filtered, ordered book list. |
| Query | `language` | string | No | `original` | ISO code such as `en` or `es`, or `original`. |
| Query | `format` | string | No | all formats | `ebook`, `audiobook`, `hardcover`, `paperback`, or `physical`. |

```bash
curl "https://api.example.com/api/series/the-empyrean?language=original&limit=50&offset=0"
```

### Successful response

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://series/41764",
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
    "provider": "canonical"
  },
  "books": [
    {
      "id": "714600",
      "slug": "fourth-wing",
      "title": "Fourth Wing",
      "author": "Rebecca Yarros",
      "cover": "https://images.example.com/fourth-wing.jpg",
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
    },
    {
      "id": "714601",
      "slug": "iron-flame",
      "title": "Iron Flame",
      "author": "Rebecca Yarros",
      "cover": "https://images.example.com/iron-flame.jpg",
      "rating": 4.5,
      "publicationDate": "2023-11-07",
      "position": 2,
      "positionLabel": "2",
      "featured": true,
      "compilation": false,
      "languageCode": "en",
      "language": "English",
      "format": "ebook",
      "formatLabel": "Ebook"
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
    "returned": 2,
    "total": 12
  }
}
```

When `language=original`, the API infers the series' majority/original language. `dedupedByPosition: true` means the API selected one best edition for each series position after applying language and format preferences. To load another page, set the next offset to `pagination.offset + pagination.returned` while it remains below `pagination.total`.

---

## Client integration notes

- Use IDs as opaque strings. Depending on the source, they may be numeric-looking strings or UUIDs.
- Treat dates as nullable ISO `YYYY-MM-DD` strings; do not assume every record has a complete date.
- Treat image URLs as remote, nullable/empty source data and provide an app-side placeholder.
- Optional metadata can be absent; explicitly nullable fields can be `null`.
- Search `totalResults` describes the returned result set, while series-details `pagination.total` is used for paging.
- Preserve a positive numeric search-result `edition.id` when the user chooses a particular provider edition. For canonical results whose edition ID is `0`, request details using the work `id` or `slug`.
- On `429`, retry with exponential backoff and jitter. Do not retry validation errors (`400`) without changing the request.
- The API may return `X-Cache: HIT`, `MISS`, or `DATABASE`. This is diagnostic only and should not affect client behavior.
