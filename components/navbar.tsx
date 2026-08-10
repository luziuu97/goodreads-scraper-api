"use client";

import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  Sparkles,
  Terminal,
  FileText,
  History,
  Info,
  GitBranch,
  Menu,
  X,
  Activity,
  ShieldCheck,
  Globe,
  Check,
  ChevronDown,
  Laptop,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTargetApi } from "@/lib/api-target-context";

export type NavTab = "explorer" | "studio" | "docs" | "changelog" | "about" | "admin";

interface NavbarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

function ApiTargetSwitcher() {
  const { targetApiUrl, setTargetApiUrl, isLocal } = useTargetApi();
  const [open, setOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState(targetApiUrl || "");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Sync custom URL input when targetApiUrl changes externally
  useEffect(() => {
    setCustomUrl(targetApiUrl || "");
  }, [targetApiUrl]);

  const handleSetLocal = () => {
    setTargetApiUrl("");
    setCustomUrl("");
    setOpen(false);
  };

  const handleApplyCustom = () => {
    setTargetApiUrl(customUrl);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
          isLocal
            ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
            : "bg-indigo-950/40 border-indigo-800/40 text-indigo-300"
        }`}
      >
        {isLocal ? (
          <Laptop className="h-3.5 w-3.5" />
        ) : (
          <Server className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[100px] truncate hidden sm:block">
          {isLocal ? "Local API" : new URL(targetApiUrl.startsWith("http") ? targetApiUrl : `http://${targetApiUrl}`).hostname}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 p-4 animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-white">Target API</span>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            All API calls (including Admin endpoints) will be directed to this base URL. Use <span className="text-emerald-400 font-mono">Local</span> for local development.
          </p>

          {/* Local option */}
          <button
            onClick={handleSetLocal}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border mb-2 text-sm transition-all ${
              isLocal
                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
                : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Laptop className="h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold text-xs">Local API</div>
                <div className="text-[10px] text-slate-500">http://localhost:3000</div>
              </div>
            </div>
            {isLocal && <Check className="h-4 w-4 text-emerald-400" />}
          </button>

          {/* Custom production URL */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs text-slate-400 font-medium mb-2">Production / Custom URL</label>
            <div className="flex gap-2">
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApplyCustom()}
                placeholder="https://api.yourdomain.com"
                className="flex-1 h-8 bg-slate-950 border-slate-800 text-xs text-slate-200"
              />
              <Button
                size="sm"
                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3"
                onClick={handleApplyCustom}
                disabled={!customUrl.trim()}
              >
                Apply
              </Button>
            </div>
          </div>

          {!isLocal && targetApiUrl && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-indigo-950/30 border border-indigo-800/30 text-xs text-indigo-300 flex items-center gap-2 break-all">
              <Server className="h-3.5 w-3.5 shrink-0" />
              <span>{targetApiUrl}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "explorer", label: "Explorer", icon: <Sparkles className="h-4 w-4" />, badge: "App" },
    { id: "admin", label: "Admin", icon: <ShieldCheck className="h-4 w-4" />, badge: "CRUD" },
    { id: "studio", label: "Studio", icon: <Terminal className="h-4 w-4" /> },
    { id: "docs", label: "Docs", icon: <FileText className="h-4 w-4" /> },
    { id: "changelog", label: "Changelog", icon: <History className="h-4 w-4" /> },
    { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("explorer")}>
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 shadow-lg shadow-emerald-950/50">
            <BookOpen className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                BooksAPI
              </span>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                v1.0
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              Structured Book & Series Metadata Platform
            </p>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isAdmin = item.id === "admin";
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  isActive
                    ? isAdmin
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-900/30"
                      : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/30"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider ${
                      isActive ? "bg-white/20 text-white" : isAdmin ? "bg-violet-900/50 text-violet-300" : "bg-slate-800 text-emerald-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: API switcher + GitHub */}
        <div className="hidden sm:flex items-center gap-3">
          <ApiTargetSwitcher />
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open("https://github.com", "_blank")}
            className="h-8 border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs gap-1.5"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </Button>
        </div>

        {/* Mobile trigger */}
        <div className="flex md:hidden items-center gap-2">
          <ApiTargetSwitcher />
          <Button size="sm" variant="ghost" onClick={() => setMobileOpen(!mobileOpen)} className="text-slate-300 hover:text-white">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950 p-4 space-y-2 animate-in slide-in-from-top-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? item.id === "admin"
                    ? "bg-violet-600 text-white font-semibold"
                    : "bg-emerald-600 text-white font-semibold"
                  : "text-slate-300 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                {item.icon}
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <Badge variant="outline" className="text-[10px] uppercase border-emerald-500/30 text-emerald-400">
                  {item.badge}
                </Badge>
              )}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              API Status: Operational
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
