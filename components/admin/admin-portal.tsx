"use client";

import { useState, useCallback, useEffect } from "react";
import {
  BookOpen,
  Library,
  Users,
  Layers,
  Tag,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Star,
  Hash,
  Globe,
  Calendar,
  ExternalLink,
  BookMarked,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTargetApi } from "@/lib/api-target-context";
import { AdminWorkModal } from "@/components/admin/admin-work-modal";
import { AdminEditionModal } from "@/components/admin/admin-edition-modal";
import { AdminAuthorModal } from "@/components/admin/admin-author-modal";
import { AdminSeriesModal } from "@/components/admin/admin-series-modal";
import { AdminGenreModal } from "@/components/admin/admin-genre-modal";

type AdminTab = "works" | "editions" | "authors" | "series" | "genres";

interface ConfirmDeleteProps {
  entityName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function ConfirmDeleteDialog({ entityName, onConfirm, onCancel, loading }: ConfirmDeleteProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-red-900/40 bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center gap-3 text-red-400 mb-4">
          <AlertCircle className="h-6 w-6" />
          <h3 className="text-base font-bold text-white">Confirm Delete</h3>
        </div>
        <p className="text-sm text-slate-300 mb-6">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-white">"{entityName}"</span>? This action cannot be
          undone and will cascade to all related records.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-slate-800" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold gap-2"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ entity, onCreate }: { entity: string; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4 border border-slate-700/50">
        <BookMarked className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="text-slate-200 font-semibold text-lg mb-1">No {entity} Found</h3>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        There are no {entity.toLowerCase()} matching your search. Create one to get started.
      </p>
      <Button
        onClick={onCreate}
        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2"
      >
        <Plus className="h-4 w-4" />
        Create {entity.slice(0, -1)}
      </Button>
    </div>
  );
}

function AccessDeniedBanner({ url }: { url: string }) {
  return (
    <div className="rounded-2xl border border-red-800/50 bg-red-950/20 p-8 text-center">
      <ShieldAlert className="h-12 w-12 text-red-400 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">Admin Access Denied (403)</h3>
      <p className="text-slate-400 text-sm mb-4 max-w-lg mx-auto">
        Your IP address is not authorized to access admin endpoints on the target API.
        <br />
        Ensure your IP is included in <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">ADMIN_ALLOWED_IPS</code> in your{" "}
        <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">.env</code> file.
      </p>
      <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs">{url}</Badge>
    </div>
  );
}

// ------------------------------------------------------------------
// Works Panel
// ------------------------------------------------------------------
function WorksPanel() {
  const { getApiUrl } = useTargetApi();
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = getApiUrl(`/api/admin/works?page=${page}&limit=${LIMIT}&includeRelations=false${debouncedQuery ? `&query=${encodeURIComponent(debouncedQuery)}` : ""}`);
      const res = await fetch(url);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load works.");
      setWorks(data.works);
      setTotal(data.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl, page, debouncedQuery]);

  useEffect(() => { fetchWorks(); }, [fetchWorks]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/works/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteTarget(null);
      fetchWorks();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (forbidden) return <AccessDeniedBanner url={getApiUrl("/api/admin/works")} />;

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search works…"
            className="pl-9 bg-slate-950 border-slate-800 text-sm h-9"
          />
        </div>
        <Button size="sm" variant="outline" onClick={fetchWorks} className="h-9 border-slate-800 bg-slate-900 text-slate-400 hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={() => { setEditTarget(null); setModalOpen(true); }} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Work
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
        </div>
      ) : works.length === 0 ? (
        <EmptyState entity="Works" onCreate={() => { setEditTarget(null); setModalOpen(true); }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Year</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Rating</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {works.map((w) => (
                <tr key={w.id} className="bg-slate-950/30 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm line-clamp-1">{w.canonicalTitle}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{w.id}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400 font-mono">{w.slug}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400">{w.publicationYear || "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {w.averageRating ? (
                      <div className="flex items-center gap-1 text-xs text-amber-400">
                        <Star className="h-3 w-3 fill-current" />
                        <span>{w.averageRating.toFixed(2)}</span>
                      </div>
                    ) : <span className="text-slate-500 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => { setEditTarget(w); setModalOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        onClick={() => setDeleteTarget(w)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{total} total works</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">Page {page} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <AdminWorkModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSuccess={fetchWorks}
        initialData={editTarget}
      />

      {deleteTarget && (
        <ConfirmDeleteDialog
          entityName={deleteTarget.canonicalTitle}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Editions Panel
// ------------------------------------------------------------------
function EditionsPanel() {
  const { getApiUrl } = useTargetApi();
  const [editions, setEditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchEditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = getApiUrl(`/api/admin/editions?page=${page}&limit=${LIMIT}${debouncedQuery ? `&query=${encodeURIComponent(debouncedQuery)}` : ""}`);
      const res = await fetch(url);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load editions.");
      setEditions(data.editions);
      setTotal(data.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl, page, debouncedQuery]);

  useEffect(() => { fetchEditions(); }, [fetchEditions]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/editions/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteTarget(null);
      fetchEditions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (forbidden) return <AccessDeniedBanner url={getApiUrl("/api/admin/editions")} />;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search editions…" className="pl-9 bg-slate-950 border-slate-800 text-sm h-9" />
        </div>
        <Button size="sm" variant="outline" onClick={fetchEditions} className="h-9 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => { setEditTarget(null); setModalOpen(true); }} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Edition
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>
      ) : editions.length === 0 ? (
        <EmptyState entity="Editions" onCreate={() => { setEditTarget(null); setModalOpen(true); }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Format</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">ISBN-13</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Lang</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {editions.map((ed) => (
                <tr key={ed.id} className="bg-slate-950/30 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm line-clamp-1">{ed.title}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{ed.id}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{ed.format}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400 font-mono">{ed.isbn13 || "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400">{ed.language || "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => { setEditTarget(ed); setModalOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeleteTarget(ed)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{total} total editions</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-2">Page {page} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      <AdminEditionModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTarget(null); }} onSuccess={fetchEditions} initialData={editTarget} />
      {deleteTarget && <ConfirmDeleteDialog entityName={deleteTarget.title} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />}
    </div>
  );
}

// ------------------------------------------------------------------
// Authors Panel
// ------------------------------------------------------------------
function AuthorsPanel() {
  const { getApiUrl } = useTargetApi();
  const [authors, setAuthors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchAuthors = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = getApiUrl(`/api/admin/authors?page=${page}&limit=${LIMIT}${debouncedQuery ? `&query=${encodeURIComponent(debouncedQuery)}` : ""}`);
      const res = await fetch(url);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load authors.");
      setAuthors(data.authors);
      setTotal(data.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl, page, debouncedQuery]);

  useEffect(() => { fetchAuthors(); }, [fetchAuthors]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/authors/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteTarget(null);
      fetchAuthors();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (forbidden) return <AccessDeniedBanner url={getApiUrl("/api/admin/authors")} />;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search authors…" className="pl-9 bg-slate-950 border-slate-800 text-sm h-9" />
        </div>
        <Button size="sm" variant="outline" onClick={fetchAuthors} className="h-9 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => { setEditTarget(null); setModalOpen(true); }} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Author
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>
      ) : authors.length === 0 ? (
        <EmptyState entity="Authors" onCreate={() => { setEditTarget(null); setModalOpen(true); }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Works</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {authors.map((a) => (
                <tr key={a.id} className="bg-slate-950/30 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm">{a.name}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{a.id}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400 font-mono">{a.slug}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400">{a.workContributions?.length ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => { setEditTarget(a); setModalOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeleteTarget(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{total} total authors</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-2">Page {page} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      <AdminAuthorModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTarget(null); }} onSuccess={fetchAuthors} initialData={editTarget} />
      {deleteTarget && <ConfirmDeleteDialog entityName={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />}
    </div>
  );
}

// ------------------------------------------------------------------
// Series Panel
// ------------------------------------------------------------------
function SeriesPanel() {
  const { getApiUrl } = useTargetApi();
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = getApiUrl(`/api/admin/series?page=${page}&limit=${LIMIT}${debouncedQuery ? `&query=${encodeURIComponent(debouncedQuery)}` : ""}`);
      const res = await fetch(url);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load series.");
      setSeriesList(data.series);
      setTotal(data.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl, page, debouncedQuery]);

  useEffect(() => { fetchSeries(); }, [fetchSeries]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/series/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteTarget(null);
      fetchSeries();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (forbidden) return <AccessDeniedBanner url={getApiUrl("/api/admin/series")} />;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search series…" className="pl-9 bg-slate-950 border-slate-800 text-sm h-9" />
        </div>
        <Button size="sm" variant="outline" onClick={fetchSeries} className="h-9 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => { setEditTarget(null); setModalOpen(true); }} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Series
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>
      ) : seriesList.length === 0 ? (
        <EmptyState entity="Series" onCreate={() => { setEditTarget(null); setModalOpen(true); }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Books</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {seriesList.map((s) => (
                <tr key={s.id} className="bg-slate-950/30 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm">{s.canonicalName}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{s.id}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400 font-mono">{s.slug}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-400">{s.booksCount ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => { setEditTarget(s); setModalOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{total} total series</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-2">Page {page} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7 border-slate-800" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      <AdminSeriesModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTarget(null); }} onSuccess={fetchSeries} initialData={editTarget} />
      {deleteTarget && <ConfirmDeleteDialog entityName={deleteTarget.canonicalName} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />}
    </div>
  );
}

// ------------------------------------------------------------------
// Genres Panel
// ------------------------------------------------------------------
function GenresPanel() {
  const { getApiUrl } = useTargetApi();
  const [genres, setGenres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchGenres = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = getApiUrl("/api/admin/genres");
      const res = await fetch(url);
      if (res.status === 403) { setForbidden(true); return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load genres.");
      setGenres(data.genres);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl]);

  useEffect(() => { fetchGenres(); }, [fetchGenres]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/genres/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDeleteTarget(null);
      fetchGenres();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (forbidden) return <AccessDeniedBanner url={getApiUrl("/api/admin/genres")} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={fetchGenres} className="h-9 border-slate-800 bg-slate-900 text-slate-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" onClick={() => { setEditTarget(null); setModalOpen(true); }} className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Genre
        </Button>
      </div>

      {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 text-emerald-500 animate-spin" /></div>
      ) : genres.length === 0 ? (
        <EmptyState entity="Genres" onCreate={() => { setEditTarget(null); setModalOpen(true); }} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {genres.map((g) => (
            <div key={g.id} className="group relative flex flex-col items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-2 w-full">
                <Tag className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="font-medium text-white text-sm truncate">{g.name}</span>
              </div>
              <span className="text-[10px] text-slate-500">{g._count?.works ?? 0} works</span>
              <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => { setEditTarget(g); setModalOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeleteTarget(g)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminGenreModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTarget(null); }} onSuccess={fetchGenres} initialData={editTarget} />
      {deleteTarget && <ConfirmDeleteDialog entityName={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />}
    </div>
  );
}

// ------------------------------------------------------------------
// Main Admin Portal
// ------------------------------------------------------------------
const ADMIN_TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: "works", label: "Works", icon: <BookOpen className="h-4 w-4" /> },
  { id: "editions", label: "Editions", icon: <Library className="h-4 w-4" /> },
  { id: "authors", label: "Authors", icon: <Users className="h-4 w-4" /> },
  { id: "series", label: "Series", icon: <Layers className="h-4 w-4" /> },
  { id: "genres", label: "Genres", icon: <Tag className="h-4 w-4" /> },
];

export function AdminPortal() {
  const [activeTab, setActiveTab] = useState<AdminTab>("works");
  const { targetApiUrl, isLocal } = useTargetApi();

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Portal</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage works, editions, authors, series, and genres across the database.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
            style={{ borderColor: isLocal ? "rgb(16 185 129 / 0.3)" : "rgb(99 102 241 / 0.3)", backgroundColor: isLocal ? "rgb(6 78 59 / 0.2)" : "rgb(49 46 129 / 0.2)", color: isLocal ? "rgb(52 211 153)" : "rgb(165 180 252)" }}>
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: isLocal ? "rgb(52 211 153)" : "rgb(165 180 252)" }} />
            {isLocal ? "Local API" : targetApiUrl || "Local API"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800 mb-6 overflow-x-auto">
        {ADMIN_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                isActive
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel Content */}
      <div className="flex-1">
        {activeTab === "works" && <WorksPanel />}
        {activeTab === "editions" && <EditionsPanel />}
        {activeTab === "authors" && <AuthorsPanel />}
        {activeTab === "series" && <SeriesPanel />}
        {activeTab === "genres" && <GenresPanel />}
      </div>
    </div>
  );
}
