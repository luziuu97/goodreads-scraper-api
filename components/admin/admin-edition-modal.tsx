"use client";

import { useState, useEffect } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTargetApi } from "@/lib/api-target-context";

interface AdminEditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
}

export function AdminEditionModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: AdminEditionModalProps) {
  const { getApiUrl } = useTargetApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workId, setWorkId] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("OTHER");
  const [language, setLanguage] = useState("");
  const [isbn10, setIsbn10] = useState("");
  const [isbn13, setIsbn13] = useState("");
  const [asin, setAsin] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [pages, setPages] = useState("");

  useEffect(() => {
    if (initialData) {
      setWorkId(initialData.workId || "");
      setTitle(initialData.title || "");
      setFormat(initialData.format || "OTHER");
      setLanguage(initialData.language || "");
      setIsbn10(initialData.isbn10 || "");
      setIsbn13(initialData.isbn13 || "");
      setAsin(initialData.asin || "");
      setPublisher(initialData.publisher || "");
      setPublicationDate(initialData.publicationDate || "");
      setPages(initialData.pages ? String(initialData.pages) : "");
    } else {
      setWorkId("");
      setTitle("");
      setFormat("OTHER");
      setLanguage("");
      setIsbn10("");
      setIsbn13("");
      setAsin("");
      setPublisher("");
      setPublicationDate("");
      setPages("");
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workId.trim()) {
      setError("Work ID is required.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      workId: workId.trim(),
      title: title.trim(),
      format: format.trim() || "OTHER",
      language: language.trim() || undefined,
      isbn10: isbn10.trim() || undefined,
      isbn13: isbn13.trim() || undefined,
      asin: asin.trim() || undefined,
      publisher: publisher.trim() || undefined,
      publicationDate: publicationDate.trim() || undefined,
      pages: pages ? parseInt(pages, 10) : undefined,
    };

    try {
      const isEdit = Boolean(initialData?.id);
      const url = getApiUrl(isEdit ? `/api/admin/editions/${initialData.id}` : "/api/admin/editions");
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${isEdit ? "update" : "create"} edition.`);
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
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white">
            {initialData ? "Edit Edition" : "Create New Edition"}
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
              <Label className="text-xs text-slate-300">Target Work ID *</Label>
              <Input
                value={workId}
                onChange={(e) => setWorkId(e.target.value)}
                placeholder="UUID or Work ID"
                className="bg-slate-950 border-slate-800 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-slate-300">Edition Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. A Game of Thrones (Collector's Hardcover)"
                className="bg-slate-950 border-slate-800 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Format</Label>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="HARDCOVER, PAPERBACK, KINDLE, AUDIOBOOK, OTHER"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Language</Label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g. en, es, fr"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">ISBN-10</Label>
              <Input
                value={isbn10}
                onChange={(e) => setIsbn10(e.target.value)}
                placeholder="10 digit ISBN"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">ISBN-13</Label>
              <Input
                value={isbn13}
                onChange={(e) => setIsbn13(e.target.value)}
                placeholder="13 digit ISBN"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Publisher</Label>
              <Input
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="Publisher Name"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Pages</Label>
              <Input
                type="number"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="e.g. 694"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>
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
              <span>{loading ? "Saving..." : initialData ? "Update Edition" : "Create Edition"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
