"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTargetApi } from "@/lib/api-target-context";

interface AdminWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
}

export function AdminWorkModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: AdminWorkModalProps) {
  const { getApiUrl } = useTargetApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canonicalTitle, setCanonicalTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [originalLanguage, setOriginalLanguage] = useState("");
  const [publicationYear, setPublicationYear] = useState("");
  const [averageRating, setAverageRating] = useState("");
  const [ratingsCount, setRatingsCount] = useState("");
  const [popularityScore, setPopularityScore] = useState("");

  const [externalIds, setExternalIds] = useState<{ provider: string; externalId: string }[]>([]);

  useEffect(() => {
    if (initialData) {
      setCanonicalTitle(initialData.canonicalTitle || "");
      setSlug(initialData.slug || "");
      setOriginalLanguage(initialData.originalLanguage || "");
      setPublicationYear(initialData.publicationYear ? String(initialData.publicationYear) : "");
      setAverageRating(initialData.averageRating ? String(initialData.averageRating) : "");
      setRatingsCount(initialData.ratingsCount ? String(initialData.ratingsCount) : "");
      setPopularityScore(initialData.popularityScore ? String(initialData.popularityScore) : "");
      setExternalIds(initialData.externalIds || []);
    } else {
      setCanonicalTitle("");
      setSlug("");
      setOriginalLanguage("");
      setPublicationYear("");
      setAverageRating("");
      setRatingsCount("");
      setPopularityScore("");
      setExternalIds([]);
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddExternalId = () => {
    setExternalIds([...externalIds, { provider: "hardcover", externalId: "" }]);
  };

  const handleRemoveExternalId = (index: number) => {
    setExternalIds(externalIds.filter((_, i) => i !== index));
  };

  const handleExternalIdChange = (index: number, field: "provider" | "externalId", val: string) => {
    const updated = [...externalIds];
    updated[index][field] = val;
    setExternalIds(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonicalTitle.trim()) {
      setError("Canonical Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      canonicalTitle: canonicalTitle.trim(),
      slug: slug.trim() || undefined,
      originalLanguage: originalLanguage.trim() || undefined,
      publicationYear: publicationYear ? parseInt(publicationYear, 10) : undefined,
      averageRating: averageRating ? parseFloat(averageRating) : undefined,
      ratingsCount: ratingsCount ? parseInt(ratingsCount, 10) : undefined,
      popularityScore: popularityScore ? parseFloat(popularityScore) : undefined,
      externalIds: externalIds.filter((e) => e.provider && e.externalId),
    };

    try {
      const isEdit = Boolean(initialData?.id);
      const url = getApiUrl(isEdit ? `/api/admin/works/${initialData.id}` : "/api/admin/works");
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${isEdit ? "update" : "create"} work.`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white">
            {initialData ? "Edit Work" : "Create New Work"}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-slate-300">Canonical Title *</Label>
              <Input
                value={canonicalTitle}
                onChange={(e) => setCanonicalTitle(e.target.value)}
                placeholder="e.g. A Game of Thrones"
                className="bg-slate-950 border-slate-800 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Slug (Auto-generated if empty)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. a-game-of-thrones"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Original Language</Label>
              <Input
                value={originalLanguage}
                onChange={(e) => setOriginalLanguage(e.target.value)}
                placeholder="e.g. English"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Publication Year</Label>
              <Input
                type="number"
                value={publicationYear}
                onChange={(e) => setPublicationYear(e.target.value)}
                placeholder="e.g. 1996"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Average Rating (0.0 - 5.0)</Label>
              <Input
                type="number"
                step="0.01"
                value={averageRating}
                onChange={(e) => setAverageRating(e.target.value)}
                placeholder="e.g. 4.45"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Ratings Count</Label>
              <Input
                type="number"
                value={ratingsCount}
                onChange={(e) => setRatingsCount(e.target.value)}
                placeholder="e.g. 235000"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Popularity Score</Label>
              <Input
                type="number"
                step="0.1"
                value={popularityScore}
                onChange={(e) => setPopularityScore(e.target.value)}
                placeholder="e.g. 98.5"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>
          </div>

          {/* External IDs */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-slate-300 font-semibold">External Identifiers</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExternalId}
                className="h-7 text-xs border-slate-800 bg-slate-950 hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add ID
              </Button>
            </div>
            {externalIds.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <Input
                  value={item.provider}
                  onChange={(e) => handleExternalIdChange(idx, "provider", e.target.value)}
                  placeholder="provider (e.g. hardcover)"
                  className="w-1/3 bg-slate-950 border-slate-800 text-xs"
                />
                <Input
                  value={item.externalId}
                  onChange={(e) => handleExternalIdChange(idx, "externalId", e.target.value)}
                  placeholder="External ID"
                  className="flex-1 bg-slate-950 border-slate-800 text-xs"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemoveExternalId(idx)}
                  className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
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
              <span>{loading ? "Saving..." : initialData ? "Update Work" : "Create Work"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
