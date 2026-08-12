# API Endpoints — App Integration Guide

Examples below were fetched from a local server (`http://localhost:3000`) on 2026-08-12. Arrays are shortened with comments where a real response had more rows.

There is **one public contract** at `/api`. Do not treat `/api/v1` as a second API.

---

## Recommended way to use this API

Store **ISBN-13** as the book’s primary key. Use ISBN-10 only as a fallback. Do **not** persist Hardcover numeric ids (`714600`, `328491`) or canonical UUIDs as the thing you send back later.

Hardcover ids change meaning across providers and do not identify an edition. An ISBN does: it is the same book whether search came from Hardcover, the canonical store, or a batch import.

### Happy path

1. **Search** `GET /api/book/search?query=…&language=en` (pass the user’s language).
2. From the chosen hit, save:
   - `isbn` (ISBN-13) — **required for details**
   - `isbn10` — fallback
   - `languageCode` — so later requests stay in that language
   - `title` / `workTitle` / `author` / `cover` — for the list UI
3. **Details** `GET /api/book/details/{isbn}?language={languageCode}`
4. **Covers / formats** with the same ISBN:  
   `GET /api/book/covers/{isbn}`  
   `GET /api/book/formats/{isbn}?language=en&format=ebook`
5. **Series** from `book.series[0].slug`:  
   `GET /api/series/{slug}`

### Identifier priority

| Priority | Field | Use for |
| --- | --- | --- |
| 1 | `isbn` (13-digit) | Details, covers, formats, your database id |
| 2 | `isbn10` | Same routes if ISBN-13 is missing |
| 3 | `edition.isbn` / `editions[].isbn` | When the top-level `isbn` is empty but a compact edition list has one |
| last | `id` (Hardcover number or UUID) | Only if the hit has **no ISBN at all** |

```
Search hit                          What the app stores              Later request
─────────────────────────────────   ─────────────────────────────    ─────────────────────────────────────────
isbn: "9781649374042"               9781649374042                    GET /api/book/details/9781649374042
id: "714600"  (Hardcover)           ignore                           do not call /details/714600
id: "d3cc279d-…" (canonical UUID)   ignore                           do not persist as the book id
edition.id: 30707731                ignore                           Hardcover-only; 0 on canonical hits
```

If you already have an ISBN from a Goodreads CSV or scanner, skip search and call details / batch-search with that ISBN.

### What not to do

- Do not open details with `id` from search when `isbn` is present.
- Do not send `provider=hardcover` unless you specifically need the live Hardcover object (different types: `author` is an array, `rating` is a string).
- Do not send `editionId` unless you are on the Hardcover-pinned path and `edition.id > 0`. Canonical search hits use `edition.id: 0`.
- Do not assume `author` is always an array or `rating` is always a string. Default details: string author, number rating.

---

## Normalized fields

Use these fields as-is. Do not re-case them in the client.

### `format`

Always lowercase. Same vocabulary on search `edition.format`, details editions, covers, formats, and series books.

| Value | Meaning |
| --- | --- |
| `ebook` | Kindle, epub, digital |
| `hardcover` | Hardcover, hardback, library binding, board book |
| `paperback` | Paperback, mass market, or a physical book with no binding detail |
| `audiobook` | Audio, Audible, MP3 |
| `other` | Last resort — source could not be classified |

Display names are on `formatLabel` (`"Hardcover"`, `"Ebook"`). You will not get `HARDCOVER` or `Hardcover` on `format`.

### `language` / `languageCode`

- `languageCode` is an ISO code (`en`, `es`, `fr`).
- `language` is the English display name (`English`, `Spanish`).
- Pass `language=es` (the code) on search, details, formats, and series. It is a **strict filter**, not a ranking hint.

### Contributors

On default details:

- `author` — string, primary author
- `authors` / `translators` / `illustrators` / `narrators` / `editors` — arrays of `{ id, name, role }`

On search, `author` is always a string and `translators` is a string array.

### Rating

Default / aggregate: `rating` is a **number** (`4.02`), `ratingsCount` is a number.  
`provider=hardcover` details only: `rating` is a **string** (`"4.28"`). Prefer the default path.

---

## Base URL and common parameters

```
/api
```

Production: `https://goodreads-scraper-api-production.up.railway.app`

URL-encode query values. Treat leftover ids as opaque strings.

### `provider`

| Value | When to use |
| --- | --- |
| omit / `aggregate` | **Default for the app.** Canonical store first, live providers as backup. |
| `hardcover` | Only if you must have the live Hardcover object. Search `id`s become Hardcover numbers. |
| `isbndb` / `openlibrary` | Pin to that catalog. Rarely needed. |
| `goodreads` | Legacy alias for `hardcover`. Do not send this. |

---

## 1. Search books

```http
GET /api/book/search
```

### Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `query` | yes | — | Title, author, ISBN, or a translated title (`Juego de Tronos`). |
| `type` | no | `all` | `all` \| `title` \| `author` \| `isbn`. Use `isbn` when the query is an ISBN. |
| `language` | no | — | ISO code. Only works with an edition in that language are returned. Title, cover, and translators come from that edition. |
| `limit` | no | `10` | 1–50. |
| `provider` | no | `aggregate` | Leave unset. |

```
GET /api/book/search?query=fourth+wing&limit=3
GET /api/book/search?query=Juego+de+Tronos&language=es&limit=2
GET /api/book/search?query=9781649374042&type=isbn
```

### App notes

- Render `title` (presentation) and keep `workTitle` as the canonical English title.
- `presentation` is `work` \| `edition` \| `isbn` — why this edition was chosen.
- Persist `isbn` + `isbn10` + `languageCode` from the hit. Then call details with the ISBN, not `id`.
- `edition.id` is a Hardcover edition id. It is `0` on canonical hits. Do not send `0` as `editionId`.

### Real response — title search

`GET /api/book/search?query=fourth+wing&limit=3`

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "fourth wing",
    "totalResults": 3,
    "books": [
      {
        "id": "714600",
        "provider": "hardcover",
        "title": "Fourth Wing",
        "workTitle": "Fourth Wing",
        "author": "Rebecca Yarros",
        "cover": "https://assets.hardcover.app/editions/30707731/3559167047761380.jpeg",
        "rating": 4.02,
        "publicationDate": "2023-05-02",
        "genres": ["Fiction", "Science Fiction & Fantasy", "Fantasy", "Fantasy romance", "High Fantasy"],
        "isbn": "9781649374042",
        "isbn10": "1649374046",
        "language": "English",
        "languageCode": "en",
        "presentation": "edition",
        "edition": {
          "id": 30707731,
          "title": "Fourth Wing",
          "isbn": "9781649374042",
          "isbn10": "1649374046",
          "asin": null,
          "format": "hardcover",
          "publicationDate": "2023-05-02",
          "pages": 517,
          "publisher": "Entangled: Red Tower Books",
          "language": "English",
          "languageCode": "en",
          "country": "United States of America",
          "countryCode": "us",
          "cover": "https://assets.hardcover.app/editions/30707731/3559167047761380.jpeg"
        }
      }
    ]
  }
}
```

Next call for this hit: `GET /api/book/details/9781649374042` — not `/api/book/details/714600`.

### Real response — translated title + language

`GET /api/book/search?query=Juego+de+Tronos&language=es&limit=2`

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "Juego de Tronos",
    "totalResults": 2,
    "books": [
      {
        "id": "644",
        "provider": "hardcover",
        "title": "Juego de tronos",
        "workTitle": "A Game of Thrones",
        "author": "George R.R. Martin",
        "cover": "https://assets.hardcover.app/edition/17355002/953ff4701de39d1ad64f263154ba141c225f7e70.jpeg",
        "rating": 4.4,
        "publicationDate": "1996-08-06",
        "isbn": "9788496208926",
        "isbn10": "8496208923",
        "language": "Spanish",
        "languageCode": "es",
        "translators": ["Cristina Macía"],
        "presentation": "edition",
        "edition": {
          "id": 15086528,
          "title": "Juego de tronos",
          "isbn": "9788496208926",
          "isbn10": "8496208923",
          "format": "paperback",
          "pages": 790,
          "publisher": "Gigamesh, S.L.",
          "language": "Spanish",
          "languageCode": "es",
          "country": "Spain",
          "countryCode": "es"
        }
      }
    ]
  }
}
```

Next call: `GET /api/book/details/9788496208926?language=es`.

### Real response — ISBN search

`GET /api/book/search?query=9781649374042&type=isbn`

Canonical hits use a UUID `id` and `edition.id: 0`. The ISBN is still the details key.

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "9781649374042",
    "totalResults": 1,
    "books": [
      {
        "id": "d3cc279d-09c3-403b-891b-92fa63d15041",
        "provider": "canonical",
        "title": "Fourth Wing",
        "workTitle": "Fourth Wing",
        "author": "Rebecca Yarros",
        "isbn": "9781649374042",
        "isbn10": "1649374046",
        "language": "English",
        "languageCode": "en",
        "presentation": "isbn",
        "edition": {
          "id": 0,
          "isbn": "9781649374042",
          "isbn10": "1649374046",
          "format": "hardcover",
          "pages": 517
        }
      }
    ]
  }
}
```

Empty search results are not cached. Successful non-empty results are cached about **1 day**.

---

## 2. Book details

```http
GET /api/book/details/{slug}
```

`{slug}` can be an ISBN-13, ISBN-10, work slug, canonical UUID, or Hardcover id. **Prefer ISBN.**

### Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `language` | no | — | ISO code. Selects title, description, edition, and contributors in that language when available. |
| `provider` | no | `aggregate` | Leave unset. `hardcover` returns a different object shape. |
| `editionId` | no | — | Hardcover edition id, only with `provider=hardcover` and only when `> 0`. |
| `reviews` | — | — | `reviews=true` returns **400**. |

```
GET /api/book/details/9781649374042
GET /api/book/details/9788496208926?language=es
GET /api/book/details/9780439554930
```

### App notes

- Default `book.author` is a **string**. `book.rating` is a **number**.
- `matchedEdition` is the edition for the ISBN / language you asked for. Use it for ISBN, pages, publisher, cover, country, and `format`.
- `editions[]` is the full catalog (often 40+). Do not render it raw — use `/api/book/formats` or `/api/book/covers` for UI.
- `book.series[].slug` is the series-details key.
- `requestedLanguage` / `isLanguageFallback` tell you whether the description is in the language you asked for.

### Real response — details by ISBN

`GET /api/book/details/9781649374042`

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://work/d3cc279d-09c3-403b-891b-92fa63d15041",
  "book": {
    "id": "d3cc279d-09c3-403b-891b-92fa63d15041",
    "slug": "fourth-wing-standard-edition-rebecca-yarros-2023",
    "title": "Fourth Wing",
    "canonicalTitle": "Fourth Wing",
    "description": "**Friends, enemies, lovers. Everyone at Basgiath War College has an agenda―because once you enter, there are only two ways out: graduate or die.** …",
    "descriptionLanguage": "en",
    "requestedLanguage": null,
    "isLanguageFallback": false,
    "language": "English",
    "languageCode": "en",
    "author": "Rebecca Yarros",
    "authors": [{ "id": "252677", "name": "Rebecca Yarros", "role": "AUTHOR" }],
    "translators": [],
    "illustrators": [],
    "narrators": [],
    "editors": [],
    "audioLength": null,
    "audioLengthMinutes": null,
    "rating": 4.02,
    "ratingsCount": 3880,
    "publicationYear": 2023,
    "publicationDate": "2023-05-02",
    "publisher": "Entangled: Red Tower Books",
    "pages": 517,
    "country": "United States of America",
    "countryCode": "us",
    "genres": ["Fiction", "Fantasy", "Fantasy romance", "High Fantasy", "Romance"],
    "matchedEdition": {
      "id": "58c0fd3d-0985-4984-9771-0d6828b89155",
      "workId": "d3cc279d-09c3-403b-891b-92fa63d15041",
      "title": "Fourth Wing",
      "format": "hardcover",
      "language": "en",
      "languageCode": "en",
      "isbn13": "9781649374042",
      "isbn10": "1649374046",
      "asin": null,
      "publisher": "Entangled: Red Tower Books",
      "publicationDate": "2023-05-02",
      "pages": 517,
      "country": "United States of America",
      "countryCode": "us",
      "isDefault": true,
      "cover": "https://assets.hardcover.app/editions/30707731/3559167047761380.jpeg"
    },
    "series": [
      {
        "id": "9c782a68-3c10-4dc7-ab7d-602dddaae8fc",
        "slug": "the-empyrean",
        "name": "The Empyrean",
        "position": 1,
        "isPrimary": true
      }
    ]
  }
}
```

The live payload also includes `editions[]` (40 rows here) and `translations[]`. Use formats/covers endpoints instead of listing every edition.

### Real response — ISBN + Spanish

`GET /api/book/details/9788496208926?language=es`

```json
{
  "success": true,
  "provider": "aggregate",
  "book": {
    "title": "Juego de tronos",
    "canonicalTitle": "A Game of Thrones",
    "descriptionLanguage": "es",
    "requestedLanguage": "es",
    "isLanguageFallback": false,
    "language": "Spanish",
    "languageCode": "es",
    "author": "George R.R. Martin",
    "translators": [
      { "id": "73f8c072-460b-476d-ab4f-ac2f822c8792", "name": "Cristina Macia", "role": "TRANSLATOR" }
    ],
    "rating": 4.4,
    "publicationDate": "1996-08-06",
    "publisher": "Gigamesh, S.L.",
    "pages": 790,
    "country": "Spain",
    "countryCode": "es",
    "matchedEdition": {
      "format": "paperback",
      "language": "es",
      "isbn13": "9788496208926",
      "isbn10": "8496208923",
      "publisher": "Gigamesh, S.L.",
      "pages": 790,
      "country": "Spain",
      "countryCode": "es"
    },
    "series": [
      { "slug": "a-song-of-ice-and-fire", "name": "A Song of Ice and Fire", "position": 1, "isPrimary": true }
    ]
  }
}
```

### Hardcover-pinned details (avoid as the default)

`GET /api/book/details/328491?provider=hardcover` returns a **different shape**: `author` is an array, `rating` is a string, `series` is `"Harry Potter #1"`. Only use this if you are explicitly integrating Hardcover.

Successful details are cached about **14 days**.

---

## 3. Book covers

```http
GET /api/book/covers/{isbn}
```

Pass the same ISBN you used for details.

### Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `limit` | no | `50` | 1–100. |
| `onlyWithCover` | no | `true` | `true`/`false`, `1`/`0`. |
| `provider` | no | `aggregate` | Leave unset. |

```
GET /api/book/covers/9781649374042?limit=3
```

`covers[].format` is the **book** format (`hardcover`, `ebook`, …), not the image type. Image type is not on this object; use `url` / `width` / `height` / `pixelCount`. Sort is already `pixelCount` descending. `bestByResolution` is the first pick for a hero image.

### Real response

`GET /api/book/covers/9781649374042?limit=3`

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://work/d3cc279d-09c3-403b-891b-92fa63d15041",
  "book": {
    "id": "d3cc279d-09c3-403b-891b-92fa63d15041",
    "slug": "fourth-wing-standard-edition-rebecca-yarros-2023",
    "title": "Fourth Wing",
    "provider": "canonical"
  },
  "covers": [
    {
      "editionId": 39,
      "title": "Fourth Wing",
      "url": "https://assets.hardcover.app/editions/30707731/3559167047761380.jpeg",
      "width": 646,
      "height": 1000,
      "ratio": 0.646,
      "pixelCount": 646000,
      "format": "hardcover",
      "isbn": "9781649374042",
      "isbn10": "1649374046",
      "publicationDate": "2023-05-02",
      "pages": 517,
      "publisher": "Entangled: Red Tower Books",
      "language": "English",
      "languageCode": "en",
      "isDefault": true
    }
  ],
  "bestByResolution": {
    "editionId": 39,
    "url": "https://assets.hardcover.app/editions/30707731/3559167047761380.jpeg",
    "width": 646,
    "height": 1000,
    "pixelCount": 646000
  },
  "totalCovers": 3,
  "totalEditions": 40
}
```

Cached about **30 days**.

---

## 4. Book formats / editions

```http
GET /api/book/formats/{isbn}
```

Use this for “Paperback / Ebook / Audiobook” pickers. Do not scrape `details.editions`.

No `provider` parameter.

### Parameters

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `language` | no | all | ISO code, or `original` (majority language). |
| `format` | no | all | `ebook` \| `audiobook` \| `hardcover` \| `paperback` \| `physical` (`physical` = hardcover + paperback). |
| `limit` | no | `50` | 1–100 after filtering. |

```
GET /api/book/formats/9781649374042?limit=4
GET /api/book/formats/9781649374042?language=en&format=ebook&limit=2
```

Build filter chips from `availableLanguages` and `availableFormats` (unfiltered work). Each row’s `format` is normalized; `formatLabel` is the display string. Prefer `isbn` on the row when the user picks an edition.

### Real response — unfiltered

`GET /api/book/formats/9781649374042?limit=4`

```json
{
  "success": true,
  "scrapedURL": "canonical://work/d3cc279d-09c3-403b-891b-92fa63d15041",
  "book": {
    "id": "d3cc279d-09c3-403b-891b-92fa63d15041",
    "slug": "fourth-wing-standard-edition-rebecca-yarros-2023",
    "title": "Fourth Wing"
  },
  "formats": [
    {
      "editionId": 1,
      "title": "Fourth Wing",
      "format": "ebook",
      "formatLabel": "Ebook",
      "language": "English",
      "languageCode": "en",
      "isbn": "9781649374080",
      "isbn10": "1649374089",
      "asin": "B0BGDM197Q",
      "pages": 665,
      "publicationDate": "2023-05-02",
      "publisher": "Entangled: Red Tower Books",
      "cover": "https://assets.hardcover.app/editions/31440211/583299284126972.jpg"
    },
    {
      "editionId": 3,
      "title": "Fourth Wing",
      "format": "audiobook",
      "formatLabel": "Audiobook",
      "language": "English",
      "languageCode": "en",
      "isbn": "9781705085042",
      "isbn10": "1705085040",
      "publisher": "Recorded Books"
    }
  ],
  "filters": {
    "language": null,
    "resolvedLanguage": null,
    "originalLanguage": "en",
    "format": null
  },
  "availableLanguages": [
    { "code": "en", "name": "English" },
    { "code": "es", "name": "Spanish" },
    { "code": "fr", "name": "French" }
  ],
  "availableFormats": ["audiobook", "ebook", "hardcover", "paperback"],
  "totalEditions": 40,
  "totalMatched": 4
}
```

### Real response — English ebooks only

`GET /api/book/formats/9781649374042?language=en&format=ebook&limit=2`

```json
{
  "filters": {
    "language": "en",
    "resolvedLanguage": "en",
    "originalLanguage": "en",
    "format": "ebook"
  },
  "formats": [
    { "format": "ebook", "isbn": "9781649374080", "asin": "B0BGDM197Q", "pages": 665 },
    { "format": "ebook", "isbn": "9780349436982", "pages": 658 }
  ],
  "totalMatched": 2
}
```

Cached about **30 days**.

---

## 5. Search series

```http
GET /api/series/search
```

Returns series, not books. Open details with `slug`.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `query` | yes | — | Series name. |
| `limit` | no | `10` | 1–50. |
| `provider` | no | `aggregate` | Leave unset. |

```
GET /api/series/search?query=The+Empyrean&limit=3
```

### Real response

```json
{
  "success": true,
  "provider": "aggregate",
  "results": {
    "query": "The Empyrean",
    "totalResults": 1,
    "series": [
      {
        "id": "9c782a68-3c10-4dc7-ab7d-602dddaae8fc",
        "provider": "canonical",
        "name": "The Empyrean",
        "slug": "the-empyrean",
        "author": "Rebecca Yarros",
        "booksCount": 1,
        "sampleBooks": ["Fourth Wing"]
      }
    ]
  }
}
```

Next: `GET /api/series/the-empyrean`.

---

## 6. Series details

```http
GET /api/series/{slug}
```

Default: one book per series position in the series’ original language.

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `language` | no | `original` | ISO code or `original`. |
| `format` | no | all | `ebook` \| `audiobook` \| `hardcover` \| `paperback` \| `physical`. |
| `limit` | no | `50` | 1–100. |
| `offset` | no | `0` | Next page = `offset + returned` while `< total`. |
| `provider` | no | `aggregate` | Leave unset. |

```
GET /api/series/harry-potter?limit=3
GET /api/series/the-empyrean
GET /api/series/a-song-of-ice-and-fire?language=es
```

Each book’s `id` is a work id. For the book page, prefer an ISBN from a follow-up details/formats call, or search that title. `format` / `formatLabel` are normalized.

### Real response

`GET /api/series/harry-potter?limit=3`

```json
{
  "success": true,
  "provider": "aggregate",
  "scrapedURL": "canonical://series/ce91cf28-b5e9-4912-91be-7df2e337a6bd",
  "series": {
    "id": "ce91cf28-b5e9-4912-91be-7df2e337a6bd",
    "slug": "harry-potter",
    "name": "Harry Potter",
    "description": null,
    "booksCount": 7,
    "primaryBooksCount": 7,
    "isCompleted": null,
    "author": { "id": 0, "name": "J.K. Rowling", "url": "" },
    "provider": "canonical"
  },
  "books": [
    {
      "id": "4d8b7248-c071-4bee-b41d-b17912efb2e5",
      "slug": "harry-potter-and-the-philosopher-s-stone",
      "title": "Harry Potter and the Sorcerer's Stone",
      "author": "J.K. Rowling",
      "cover": "https://assets.hardcover.app/edition/2667580/06168492-bf52-4333-9ac6-66ed21907865.jpg",
      "rating": 4.28,
      "publicationDate": "2003-11-01",
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
    "resolvedLanguage": null,
    "originalLanguage": null,
    "format": null,
    "dedupedByPosition": true
  },
  "pagination": { "limit": 3, "offset": 0, "returned": 3, "total": 7 }
}
```

Cached about **14 days**.

---

## 7. Batch search

```http
POST /api/book/batch-search
Content-Type: application/json
```

Use this for Goodreads CSV / library imports. Prefer one item per ISBN.

HTTP 200 even when some items fail — check each item’s `success`.

### Body

| Field | Required | Description |
| --- | --- | --- |
| `provider` | no | Default `aggregate`. |
| `items` | yes | 1–50 objects. |

Each item: `isbn` **or** `query` **or** `title` (+ optional `author`). Optional `type`, `language`, `limit` (1–50, default 10).

```json
{
  "items": [
    { "isbn": "9781649374042", "limit": 1 },
    { "title": "Foundation", "author": "Isaac Asimov", "limit": 1 }
  ]
}
```

Same search-hit shape as `GET /api/book/search`. Store `isbn` from each hit.

### Real response

`POST /api/book/batch-search` with the body above:

```json
{
  "success": true,
  "provider": "aggregate",
  "totalItems": 2,
  "successfulItems": 2,
  "failedItems": 0,
  "results": [
    {
      "index": 0,
      "query": "9781649374042",
      "success": true,
      "books": [
        {
          "id": "d3cc279d-09c3-403b-891b-92fa63d15041",
          "provider": "canonical",
          "title": "Fourth Wing",
          "isbn": "9781649374042",
          "isbn10": "1649374046",
          "presentation": "isbn"
        }
      ]
    },
    {
      "index": 1,
      "query": "Foundation Isaac Asimov",
      "success": true,
      "books": [
        {
          "id": "188628",
          "provider": "hardcover",
          "title": "Foundation",
          "author": "Isaac Asimov"
        }
      ]
    }
  ]
}
```

Limit: **5 batch requests per 10 seconds** per IP. Not cached as a whole.

---

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Missing/invalid params, or `reviews=true` |
| 404 | Book, edition, or series not found |
| 429 | Rate limit — retry with backoff |
| 500 | Unexpected server error |
| 503 | Provider not configured |

```json
{ "error": "Query parameter is required" }
```

```json
{ "success": false, "status": "Error - Invalid Query", "error": "Book not found" }
```

Branch on HTTP status.

---

## Caching

| Endpoint | TTL |
| --- | --- |
| Search / series search (≥1 hit) | ~1 day |
| Details / series details | ~14 days |
| Covers / formats | ~30 days |
| Empty search / errors / batch | not cached |

`X-Cache: HIT` \| `MISS` \| `DATABASE` is diagnostic only.

---

## Removed

`/api/author/*`, `/api/user/*`, lists, quotes, and review scrapes return **404**. `reviews=true` on details returns **400**.
