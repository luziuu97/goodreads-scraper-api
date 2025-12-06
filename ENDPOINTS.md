# API Endpoints

The Goodreads Scraper API provides the following endpoints to retrieve data from Goodreads.

## Base URL
All endpoints are prefixed with `/api`.

## 1. User Details
Retrieves detailed profile information for a Goodreads user.

- **Endpoint**: `GET /api/user/details/:slug`
- **Parameters**:
  - `slug`: The user ID and name slug (e.g., `84291607-water-proof`).

### Response Structure
```json
{
  "success": true,
  "scrapedURL": "https://www.goodreads.com/user/show/...",
  "user": {
    "profileImage": "...",
    "name": "...",
    "username": "...",
    "location": "...",
    "website": "...",
    "joinDate": "...",
    "lastActive": "...",
    "birthday": "...",
    "bio": "...",
    "stats": {
        "booksRead": "...",
        "booksToRead": "...",
        "currentlyReading": "...",
        "avgRating": "...",
        "totalRatings": "...",
        "totalReviews": "...",
        "friendsCount": "...",
        "groupsCount": "..."
    },
    "currentlyReadingBooks": [
      {
        "title": "...",
        "author": "...",
        "cover": "...",
        "shelves": ["..."],
        "readingDate": "...",
        "bookUrl": "...",
        "authorUrl": "..."
      }
    ],
    "favoriteAuthors": [...],
    "favoriteBooks": [...],
    "recentActivity": [...],
    "shelves": [...],
    "readingChallenge": {
        "readCount": 0,
        "targetCount": 0,
        "percentage": "0%",
        "progressText": "...",
        "url": "..."
    },
    "lastScraped": "..."
  }
}
```

## 2. Book Details
Retrieves detailed information about a specific book.

- **Endpoint**: `GET /api/book/details/:slug`
- **Parameters**:
  - `slug`: The book ID and title slug (e.g., `12345.Some_Book`).

### Response Structure
```json
{
  "success": true,
  "scrapedURL": "...",
  "book": {
    "title": "...",
    "cover": "...",
    "author": "...",
    "rating": "...",
    "ratingCount": "...",
    "reviewsCount": "...",
    "description": "...",
    "genres": [...],
    "publishDate": "...",
    "reviewBreakdown": { "rating5": "...", ... },
    "reviews": [
      { "author": "...", "stars": "...", "text": "...", "date": "...", "likes": "..." }
    ],
    "quotes": "...",
    "questions": "..."
  }
}
```

## 3. Author Details
Retrieves profile information for an author.

- **Endpoint**: `GET /api/author/details/:slug`
- **Parameters**:
  - `slug`: The author ID and name slug.

### Response Structure
```json
{
  "success": true,
  "scrapedURL": "...",
  "author": {
    "name": "...",
    "image": "...",
    "birthDate": "...",
    "deathDate": "...",
    "description": "...",
    "genres": [...],
    "influences": [...],
    "books": [ ... ], // Top books
    "series": [ ... ]
  }
}
```

## 4. Author Books
Retrieves a paginated list of books by a specific author.

- **Endpoint**: `GET /api/author/books/:slug`
- **Parameters**:
  - `slug`: The author ID and name slug.
- **Query Parameters**:
  - `page`: Page number (default: 1).
  - `limit`: Number of results per page (default: 10, max: 50).
  - `sort`: Sort order (`popularity`, `title`, `average_rating`. Default: `popularity`).

### Response Structure
```json
{
  "success": true,
  "scrapedURL": "...",
  "pagination": {
      "currentPage": 1,
      "limit": 10,
      "sort": "popularity",
      "hasNextPage": true,
      "hasPreviousPage": false
  },
  "books": {
    "title": "...",
    "books": [
       { "id": 1, "title": "...", "cover": "...", "rating": "...", "bookURL": "..." }
    ]
  }
}
```
