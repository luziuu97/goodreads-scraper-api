"use client";

import { useState } from "react";
import { Check, Copy, Download, ChevronRight, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface JsonViewerProps {
  data: any;
  title?: string;
  maxHeight?: string;
}

export function JsonViewer({ data, title = "JSON Data", maxHeight = "max-h-[500px]" }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const jsonString = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 text-slate-100 overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block animate-pulse" />
          <h4 className="text-xs font-semibold text-slate-300 tracking-wide uppercase">{title}</h4>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search response..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 w-36 sm:w-48 pl-8 pr-2 text-xs bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 focus-visible:ring-emerald-500"
            />
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
            className="h-7 px-2 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {collapsed ? "Expand" : "Collapse"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 px-2 text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            className="h-7 px-2 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Code body */}
      {!collapsed && (
        <div className={`p-4 overflow-auto font-mono text-xs leading-relaxed ${maxHeight}`}>
          <pre className="text-emerald-300/90 whitespace-pre-wrap break-all">
            {filter
              ? jsonString
                  .split("\n")
                  .filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
                  .join("\n") || `// No lines matching "${filter}"`
              : jsonString}
          </pre>
        </div>
      )}
    </div>
  );
}
