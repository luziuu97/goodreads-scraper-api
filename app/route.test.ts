import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("GET / returns API index JSON, not a frontend page", async () => {
  const res = await GET();
  assert.equal(res.headers.get("content-type")?.includes("application/json"), true);
  const body = await res.json();
  assert.equal(body.name, "BooksAPI");
  assert.equal(body.status, "operational");
  assert.equal(typeof body.endpoints.search_books, "string");
  assert.equal("jsx" in body, false);
});
