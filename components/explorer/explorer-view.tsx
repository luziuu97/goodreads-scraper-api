"use client";

import { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  Sparkles,
  Library,
  Layers,
  Images,
  Star,
  Globe,
  Filter,
  ArrowRight,
  ListOrdered,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JsonViewer } from "@/components/ui/json-viewer";
import Image from "next/image";

type ExplorerSubTab = "books" | "series" | "batch";

export function ExplorerView() {
  const [subTab, setSubTab] = useState<ExplorerSubTab>("books");
  const [query, setQuery] = useState("Fourth Wing");
  const [searchType, setSearchType] = useState("all");
  const [provider, setProvider] = useState("aggregate");
  const [language, setLanguage] = useState("");
  const [limit, setLimit] = useState("12");

  const [loading, setLoading] = useState(false);
  const [bookResults, setBookResults] = useState<any[]>([]);
  const [seriesResults, setSeriesResults] = useState<any[]>([]);

  // Modals state
  const [activeModal, setActiveModal] = useState<"details" | "covers" | "formats" | "series" | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [selectedEditionId, setSelectedEditionId] = useState<string>("");

  // Batch search state
  const [batchInput, setBatchInput] = useState<string>(
    JSON.stringify(
      {
        provider: "aggregate",
        items: [
          { query: "Dune", limit: 3 },
          { isbn: "9780441172719" },
          { title: "Foundation", author: "Isaac Asimov" },
          { query: "Harry Potter", limit: 2 }
        ]
      },
      null,
      2
    )
  );
  const [batchResults, setBatchResults] = useState<any>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Auto search on mount or query submit
  useEffect(() => {
    handleSearch();
  }, [subTab]);

  const handleSearch = async () => {
    if (!query.trim() && subTab !== "batch") return;
    setLoading(true);

    try {
      if (subTab === "books") {
        const params = new URLSearchParams({ query: query.trim() });
        if (searchType && searchType !== "all") params.set("type", searchType);
        if (provider) params.set("provider", provider);
        if (language) params.set("language", language);
        if (limit) params.set("limit", limit);

        const res = await fetch(`/api/book/search?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.results?.books) {
          setBookResults(data.results.books);
        } else {
          setBookResults([]);
        }
      } else if (subTab === "series") {
        const params = new URLSearchParams({ query: query.trim() });
        if (provider) params.set("provider", provider);
        if (limit) params.set("limit", limit);

        const res = await fetch(`/api/series/search?${params.toString()}`);
        const data = await res.json();
        if (data.success && data.results?.series) {
          setSeriesResults(data.results.series);
        } else {
          setSeriesResults([]);
        }
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Details Modal Data
  const openDetailsModal = async (slug: string, editionId?: string) => {
    setSelectedSlug(slug);
    setActiveModal("details");
    setModalLoading(true);
    try {
      const params = new URLSearchParams();
      if (provider) params.set("provider", provider);
      if (editionId) params.set("editionId", editionId);
      const res = await fetch(`/api/book/details/${encodeURIComponent(slug)}?${params.toString()}`);
      const data = await res.json();
      setModalData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  // Fetch Covers Modal Data
  const openCoversModal = async (slug: string) => {
    setSelectedSlug(slug);
    setActiveModal("covers");
    setModalLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (provider) params.set("provider", provider);
      const res = await fetch(`/api/book/covers/${encodeURIComponent(slug)}?${params.toString()}`);
      const data = await res.json();
      setModalData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  // Fetch Formats Modal Data
  const openFormatsModal = async (slug: string) => {
    setSelectedSlug(slug);
    setActiveModal("formats");
    setModalLoading(true);
    try {
      const params = new URLSearchParams();
      if (language) params.set("language", language);
      const res = await fetch(`/api/book/formats/${encodeURIComponent(slug)}?${params.toString()}`);
      const data = await res.json();
      setModalData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  // Fetch Series Details Modal Data
  const openSeriesDetailsModal = async (slug: string) => {
    setSelectedSlug(slug);
    setActiveModal("series");
    setModalLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (language) params.set("language", language);
      const res = await fetch(`/api/series/${encodeURIComponent(slug)}?${params.toString()}`);
      const data = await res.json();
      setModalData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  // Execute Batch Search
  const handleBatchExecute = async () => {
    setBatchLoading(true);
    setBatchResults(null);
    try {
      const payload = JSON.parse(batchInput);
      const res = await fetch("/api/book/batch-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setBatchResults(data);
    } catch (err: any) {
      setBatchResults({
        success: false,
        error: "Invalid JSON payload or network error",
        message: err.message
      });
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" /> Live Metadata Discovery Engine
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Explore Books, Series & Editions in Real-Time
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Search multi-provider structured metadata aggregated from Hardcover, ISBNDB, and OpenLibrary. Inspect high-res covers, reading order trees, and edition formats.
          </p>

          {/* Sub Tab Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={() => setSubTab("books")}
              variant={subTab === "books" ? "default" : "outline"}
              className={`h-9 text-xs font-medium gap-2 ${
                subTab === "books"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <BookOpen className="h-4 w-4" /> Book Search
            </Button>

            <Button
              onClick={() => setSubTab("series")}
              variant={subTab === "series" ? "default" : "outline"}
              className={`h-9 text-xs font-medium gap-2 ${
                subTab === "series"
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Library className="h-4 w-4" /> Series Visualizer
            </Button>

            <Button
              onClick={() => setSubTab("batch")}
              variant={subTab === "batch" ? "default" : "outline"}
              className={`h-9 text-xs font-medium gap-2 ${
                subTab === "batch"
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : "border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Upload className="h-4 w-4" /> Batch Library Import
            </Button>
          </div>

        </div>
      </div>

      {/* Main Search Controls bar (for Books & Series tabs) */}
      {subTab !== "batch" && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder={
                  subTab === "books"
                    ? "Search title, author, or ISBN (e.g. Fourth Wing, Dune, 9781649374042)..."
                    : "Search series name (e.g. The Empyrean, Percy Jackson)..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 pl-10 pr-4 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-950/40"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {loading ? "Searching..." : "Search API"}
            </Button>
          </form>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center text-slate-400 font-medium gap-1">
                <Filter className="h-3.5 w-3.5" /> Filters:
              </span>

              {/* Provider select */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Provider:</span>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-8 w-32 bg-slate-950 border-slate-800 text-xs">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <SelectItem value="aggregate">Aggregate (Default)</SelectItem>
                    <SelectItem value="hardcover">Hardcover</SelectItem>
                    <SelectItem value="isbndb">ISBNDB</SelectItem>
                    <SelectItem value="openlibrary">OpenLibrary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type select for books */}
              {subTab === "books" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Type:</span>
                  <Select value={searchType} onValueChange={setSearchType}>
                    <SelectTrigger className="h-8 w-28 bg-slate-950 border-slate-800 text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="author">Author</SelectItem>
                      <SelectItem value="isbn">ISBN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Language code */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Language:</span>
                <Input
                  type="text"
                  placeholder="en, es, fr..."
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-8 w-20 bg-slate-950 border-slate-800 text-xs text-center uppercase placeholder:normal-case placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Quick sample chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-slate-500">Quick Try:</span>
              {["Fourth Wing", "Juego de Tronos", "Dune", "Percy Jackson"].map((sample) => (
                <button
                  key={sample}
                  onClick={() => {
                    setQuery(sample);
                    if (sample === "Percy Jackson") setSubTab("series");
                    else setSubTab("books");
                    setTimeout(() => handleSearch(), 50);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results View based on SubTab */}
      {subTab === "books" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-400" />
              Book Search Results ({bookResults.length})
            </h3>
            {bookResults.length > 0 && (
              <span className="text-xs text-slate-400">Click any book card to inspect complete API details</span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-80 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse p-4 space-y-3">
                  <div className="h-44 w-full bg-slate-800/80 rounded-lg" />
                  <div className="h-4 w-3/4 bg-slate-800/80 rounded" />
                  <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
                </div>
              ))}
            </div>
          ) : bookResults.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-3">
              <BookOpen className="h-12 w-12 text-slate-600 mx-auto" />
              <h4 className="text-lg font-medium text-slate-300">No books found</h4>
              <p className="text-xs text-slate-500">Try adjusting search parameters, provider mode, or language filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {bookResults.map((book, idx) => (
                <Card
                  key={book.id || idx}
                  className="group relative border border-slate-800 bg-slate-900/80 hover:bg-slate-900 hover:border-emerald-500/50 transition-all duration-300 overflow-hidden flex flex-col justify-between shadow-xl"
                >
                  <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                    {/* Cover art container */}
                    <div className="relative h-56 w-full rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800">
                      {book.cover ? (
                        <img
                          src={book.cover}
                          alt={book.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center text-slate-600">
                          <BookOpen className="h-10 w-10 mb-2" />
                          <span className="text-xs">No Cover URL</span>
                        </div>
                      )}

                      {/* Rating pill */}
                      {book.rating && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-800 text-amber-400 text-xs font-bold shadow-md">
                          <Star className="h-3 w-3 fill-amber-400" />
                          <span>{Number(book.rating).toFixed(2)}</span>
                        </div>
                      )}

                      {/* Provider badge */}
                      <Badge variant="outline" className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md border-slate-800 text-slate-300 text-[10px] uppercase">
                        {book.provider || "hardcover"}
                      </Badge>
                    </div>

                    {/* Meta info */}
                    <div className="space-y-1 flex-1">
                      <h4 className="font-bold text-sm text-slate-100 line-clamp-1 group-hover:text-emerald-400 transition-colors">
                        {book.title}
                      </h4>
                      {book.workTitle && book.workTitle !== book.title && (
                        <p className="text-[11px] text-slate-400 italic line-clamp-1">
                          Canonical: {book.workTitle}
                        </p>
                      )}
                      <p className="text-xs text-slate-300 font-medium">
                        {book.author || "Unknown Author"}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px] text-slate-400">
                        {book.publicationDate && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {book.publicationDate.split("-")[0]}
                          </span>
                        )}
                        {book.languageCode && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 uppercase">
                            {book.languageCode}
                          </span>
                        )}
                        {book.isbn && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            ISBN: {book.isbn}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-3 gap-1.5 pt-3 border-t border-slate-800/80">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDetailsModal(book.id, book.edition?.id)}
                        className="h-7 text-[11px] bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40"
                      >
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openCoversModal(book.id)}
                        className="h-7 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Covers
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openFormatsModal(book.id)}
                        className="h-7 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Formats
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Series SubTab */}
      {subTab === "series" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <Library className="h-5 w-5 text-indigo-400" />
              Series Search Results ({seriesResults.length})
            </h3>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse p-4 space-y-3" />
              ))}
            </div>
          ) : seriesResults.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-3">
              <Library className="h-12 w-12 text-slate-600 mx-auto" />
              <h4 className="text-lg font-medium text-slate-300">No series found</h4>
              <p className="text-xs text-slate-500">Try searching for popular series like "The Empyrean", "Dune", or "Percy Jackson".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {seriesResults.map((s, idx) => (
                <Card
                  key={s.id || idx}
                  className="border border-slate-800 bg-slate-900/80 hover:bg-slate-900 hover:border-indigo-500/50 transition-all p-5 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-base text-slate-100 hover:text-indigo-400 transition-colors">
                        {s.name}
                      </h4>
                      <Badge className="bg-indigo-950 text-indigo-300 border-indigo-800 text-[10px]">
                        {s.booksCount || 0} Books
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-400">By {s.author || "Unknown Author"}</p>

                    {s.sampleBooks && s.sampleBooks.length > 0 && (
                      <div className="text-xs text-slate-500 space-y-1 pt-2">
                        <span className="text-slate-400 font-medium">Sample Titles:</span>
                        <div className="flex flex-wrap gap-1">
                          {s.sampleBooks.map((t: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => openSeriesDetailsModal(s.slug || s.id)}
                    className="w-full h-9 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold gap-2"
                  >
                    <ListOrdered className="h-4 w-4" /> Inspect Reading Order
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Batch Import SubTab */}
      {subTab === "batch" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <Upload className="h-5 w-5 text-purple-400" />
                Batch Search Import Payload (`POST /api/book/batch-search`)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Batch resolve up to 50 books in a single API call with cached pre-resolution & concurrency throttles.
              </p>
            </div>

            <div className="space-y-2">
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                rows={14}
                className="w-full font-mono text-xs p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />

              <Button
                onClick={handleBatchExecute}
                disabled={batchLoading}
                className="w-full h-11 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-purple-950/40"
              >
                {batchLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {batchLoading ? "Processing Batch Request..." : "Run Batch Import"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Batch Execution Results</h3>
            {batchResults ? (
              <JsonViewer data={batchResults} title="Batch Search Output" maxHeight="max-h-[500px]" />
            ) : (
              <div className="h-96 rounded-xl border border-slate-800 bg-slate-900/40 p-8 flex flex-col items-center justify-center text-center space-y-3">
                <Upload className="h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-400">Click "Run Batch Import" to test batch resolution live.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Modal Renderer */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in-50">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase text-xs">
                  {activeModal}
                </Badge>
                <h3 className="text-xl font-bold text-white">
                  {selectedSlug ? `Metadata for "${selectedSlug}"` : "API Response Inspector"}
                </h3>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setActiveModal(null);
                  setModalData(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Body */}
            {modalLoading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
                <p className="text-xs text-slate-400">Fetching API endpoint metadata...</p>
              </div>
            ) : modalData ? (
              <div className="space-y-6">
                {/* Specific view for details */}
                {activeModal === "details" && modalData.book && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Cover art preview */}
                    <div className="space-y-3">
                      <div className="h-72 w-full rounded-xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
                        {modalData.book.cover ? (
                          <img src={modalData.book.cover} alt="Cover" className="h-full w-full object-cover" />
                        ) : (
                          <BookOpen className="h-12 w-12 text-slate-600" />
                        )}
                      </div>
                      {modalData.scrapedURL && (
                        <a
                          href={modalData.scrapedURL}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> View Provider Link
                        </a>
                      )}
                    </div>

                    {/* Metadata breakdown */}
                    <div className="md:col-span-2 space-y-4 text-xs">
                      <div>
                        <h2 className="text-2xl font-bold text-white">{modalData.book.title}</h2>
                        <p className="text-sm text-emerald-400">
                          By {Array.isArray(modalData.book.author) ? modalData.book.author.map((a: any) => a.name).join(", ") : modalData.book.author || "Unknown"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
                        <div>
                          <span className="text-slate-500">Rating:</span>
                          <p className="font-semibold text-amber-400">{modalData.book.rating || "N/A"}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Pages:</span>
                          <p className="font-semibold text-slate-200">{modalData.book.pages || "N/A"}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Publisher:</span>
                          <p className="font-semibold text-slate-200">{modalData.book.publishedBy || modalData.book.edition?.publisher || "N/A"}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Language:</span>
                          <p className="font-semibold text-slate-200">{modalData.book.language || "N/A"}</p>
                        </div>
                      </div>

                      {/* Contributor roles */}
                      {modalData.book.translators?.length > 0 && (
                        <div>
                          <span className="text-slate-400 font-semibold">Translators:</span>
                          <p className="text-slate-200">{modalData.book.translators.join(", ")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Specific view for covers */}
                {activeModal === "covers" && modalData.covers && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Found {modalData.totalCovers} high-res edition covers</span>
                      {modalData.bestByResolution && (
                        <span className="text-emerald-400">
                          Best Resolution: {modalData.bestByResolution.width}x{modalData.bestByResolution.height} ({modalData.bestByResolution.pixelCount} px)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto pr-2">
                      {modalData.covers.map((c: any, i: number) => (
                        <div key={i} className="rounded-xl bg-slate-950 border border-slate-800 p-2 space-y-2">
                          <div className="h-44 w-full rounded bg-slate-900 overflow-hidden flex items-center justify-center">
                            <img src={c.url} alt="Cover edition" className="h-full w-full object-cover" />
                          </div>
                          <div className="text-[11px] space-y-1">
                            <p className="font-semibold text-slate-200 line-clamp-1">{c.format || "Edition"}</p>
                            <div className="flex items-center justify-between text-slate-400">
                              <span>{c.width}x{c.height}</span>
                              {c.color && (
                                <span
                                  className="h-3 w-3 rounded-full border border-slate-700"
                                  style={{ backgroundColor: c.color }}
                                  title={`Dominant color: ${c.color}`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw JSON fallback */}
                <JsonViewer data={modalData} title="Full API Response Payload" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
