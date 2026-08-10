"use client";

import { useState, useEffect } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTargetApi } from "@/lib/api-target-context";

interface AdminSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
}

export function AdminSeriesModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: AdminSeriesModalProps) {
  const { getApiUrl } = useTargetApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canonicalName, setCanonicalName] = useState("");
  const [slug, setSlug] = useState("");
  const [booksCount, setBooksCount] = useState("");

  useEffect(() => {
    if (initialData) {
      setCanonicalName(initialData.canonicalName || "");
      setSlug(initialData.slug || "");
      setBooksCount(initialData.booksCount ? String(initialData.booksCount) : "");
    } else {
      setCanonicalName("");
      setSlug("");
      setBooksCount("");
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonicalName.trim()) {
      setError("Canonical Name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      canonicalName: canonicalName.trim(),
      slug: slug.trim() || undefined,
      booksCount: booksCount ? parseInt(booksCount, 10) : undefined,
    };

    try {
      const isEdit = Boolean(initialData?.id);
      const url = getApiUrl(isEdit ? `/api/admin/series/${initialData.id}` : "/api/admin/series");
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${isEdit ? "update" : "create"} series.`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white">
            {initialData ? "Edit Series" : "Create New Series"}
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-slate-400">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Canonical Name *</Label>
            <Input
              value={canonicalName}
              onChange={(e) => setCanonicalName(e.target.value)}
              placeholder="e.g. The Stormlight Archive"
              className="bg-slate-950 border-slate-800 text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Slug (Auto-generated if empty)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. the-stormlight-archive"
              className="bg-slate-950 border-slate-800 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Books Count</Label>
            <Input
              type="number"
              value={booksCount}
              onChange={(e) => setBooksCount(e.target.value)}
              placeholder="e.g. 5"
              className="bg-slate-950 border-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-800">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{loading ? "Saving..." : initialData ? "Update Series" : "Create Series"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
