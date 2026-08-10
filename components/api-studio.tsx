"use client";

import { useState, useEffect } from "react";
import { endpoints, Endpoint } from "@/lib/api-endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JsonViewer } from "@/components/ui/json-viewer";
import { Play, Copy, Check, Terminal, Clock, Code, FileCode, CheckCircle2 } from "lucide-react";

export function ApiStudio() {
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("search-books");
  const [params, setParams] = useState<Record<string, string>>({});
  const [postBody, setPostBody] = useState<string>("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [requestTime, setRequestTime] = useState<number | null>(null);
  const [activeSnippetLang, setActiveSnippetLang] = useState<"javascript" | "typescript" | "python" | "nodejs">("javascript");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const endpoint = endpoints.find((e) => e.id === selectedEndpointId) || endpoints[0];

  // Set default param placeholders when endpoint changes
  useEffect(() => {
    const initialParams: Record<string, string> = {};
    endpoint.parameters.forEach((p) => {
      if (p.name === "slug") initialParams.slug = "fourth-wing";
      if (p.name === "query") initialParams.query = "Fourth Wing";
      if (p.name === "limit") initialParams.limit = "10";
      if (p.name === "provider") initialParams.provider = "aggregate";
    });
    setParams(initialParams);

    if (endpoint.id === "batch-search-books") {
      setPostBody(
        JSON.stringify(
          {
            provider: "aggregate",
            items: [
              { query: "Dune", limit: 5 },
              { isbn: "9780441172719" },
              { title: "Foundation", author: "Isaac Asimov" }
            ]
          },
          null,
          2
        )
      );
    }
  }, [selectedEndpointId]);

  const handleParamChange = (key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleExecute = async () => {
    setLoading(true);
    setResponse(null);
    setRequestTime(null);

    const startTime = performance.now();

    try {
      let url = "";
      let options: RequestInit = { method: endpoint.method };

      if (endpoint.id === "get-book-details") {
        const slug = params.slug || "fourth-wing";
        const queryParams = new URLSearchParams();
        if (params.provider) queryParams.set("provider", params.provider);
        if (params.editionId) queryParams.set("editionId", params.editionId);
        url = `/api/book/details/${encodeURIComponent(slug)}?${queryParams.toString()}`;
      } else if (endpoint.id === "get-book-covers") {
        const slug = params.slug || "fourth-wing";
        const queryParams = new URLSearchParams();
        if (params.provider) queryParams.set("provider", params.provider);
        if (params.limit) queryParams.set("limit", params.limit);
        url = `/api/book/covers/${encodeURIComponent(slug)}?${queryParams.toString()}`;
      } else if (endpoint.id === "get-book-formats") {
        const slug = params.slug || "fourth-wing";
        const queryParams = new URLSearchParams();
        if (params.language) queryParams.set("language", params.language);
        if (params.format) queryParams.set("format", params.format);
        url = `/api/book/formats/${encodeURIComponent(slug)}?${queryParams.toString()}`;
      } else if (endpoint.id === "search-books") {
        const queryParams = new URLSearchParams({ query: params.query || "Fourth Wing" });
        if (params.type) queryParams.set("type", params.type);
        if (params.provider) queryParams.set("provider", params.provider);
        if (params.limit) queryParams.set("limit", params.limit);
        url = `/api/book/search?${queryParams.toString()}`;
      } else if (endpoint.id === "batch-search-books") {
        url = "/api/book/batch-search";
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: postBody
        };
      } else if (endpoint.id === "search-series") {
        const queryParams = new URLSearchParams({ query: params.query || "Empyrean" });
        if (params.provider) queryParams.set("provider", params.provider);
        if (params.limit) queryParams.set("limit", params.limit);
        url = `/api/series/search?${queryParams.toString()}`;
      } else if (endpoint.id === "get-series-details") {
        const slug = params.slug || "the-empyrean";
        const queryParams = new URLSearchParams();
        if (params.provider) queryParams.set("provider", params.provider);
        if (params.limit) queryParams.set("limit", params.limit);
        url = `/api/series/${encodeURIComponent(slug)}?${queryParams.toString()}`;
      }

      const res = await fetch(url, options);
      const endTime = performance.now();
      setRequestTime(Math.round(endTime - startTime));

      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({
        success: false,
        error: "Network execution failed",
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const copyCodeSnippet = () => {
    const code = endpoint.codeSnippets[activeSnippetLang];
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Studio Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-6 w-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">API Studio Workbench</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Interactive request runner, parameter builder, live latency telemetry & SDK code generator for BooksAPI.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs px-2.5 py-1">
            Base URL: /api
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Endpoint Picker & Parameter Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Endpoint selector list */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Select Endpoint</Label>
            <div className="space-y-1">
              {endpoints.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => setSelectedEndpointId(ep.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    selectedEndpointId === ep.id
                      ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-950/40 font-semibold"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="truncate">{ep.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase border-0 font-bold ${
                      ep.method === "GET"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-purple-500/10 text-purple-400"
                    }`}
                  >
                    {ep.method}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint header & form parameters */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  className={`uppercase text-xs font-bold ${
                    endpoint.method === "GET"
                      ? "bg-emerald-600 text-white"
                      : "bg-purple-600 text-white"
                  }`}
                >
                  {endpoint.method}
                </Badge>
                <code className="text-xs font-mono bg-slate-950 px-2 py-1 rounded text-emerald-300 border border-slate-800">
                  {endpoint.url}
                </code>
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{endpoint.description}</p>
            </div>

            {/* Params Builder */}
            {endpoint.id === "batch-search-books" ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-300">Request Body Payload (JSON)</Label>
                <textarea
                  value={postBody}
                  onChange={(e) => setPostBody(e.target.value)}
                  rows={10}
                  className="w-full font-mono text-xs p-3 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Parameters</Label>
                {endpoint.parameters.map((param) => (
                  <div key={param.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        {param.name} {param.required && <span className="text-rose-400">*</span>}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">{param.type}</span>
                    </div>

                    {param.type === "select" ? (
                      <Select
                        value={params[param.name] || ""}
                        onValueChange={(val) => handleParamChange(param.name, val)}
                      >
                        <SelectTrigger className="h-9 bg-slate-950 border-slate-800 text-xs text-slate-200">
                          <SelectValue placeholder={`Select ${param.name}`} />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                          {param.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="text"
                        placeholder={param.placeholder || `Enter ${param.name}`}
                        value={params[param.name] || ""}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="h-9 bg-slate-950 border-slate-800 text-xs text-slate-200 focus-visible:ring-emerald-500"
                      />
                    )}
                    <p className="text-[11px] text-slate-500">{param.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Execute Request Button */}
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-950/50 gap-2"
            >
              <Play className="h-4 w-4 fill-white" />
              {loading ? "Executing Request..." : "Execute API Request"}
            </Button>
          </div>
        </div>

        {/* Right Column: Results & Code Snippets */}
        <div className="lg:col-span-7 space-y-6">
          <Tabs defaultValue="response">
            <TabsList className="bg-slate-900 border border-slate-800 p-1">
              <TabsTrigger value="response" className="text-xs gap-1.5">
                <Terminal className="h-3.5 w-3.5" /> Response Payload
              </TabsTrigger>
              <TabsTrigger value="code" className="text-xs gap-1.5">
                <Code className="h-3.5 w-3.5" /> SDK Code Snippets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="response" className="space-y-4 mt-4">
              {/* Telemetry info */}
              {requestTime !== null && (
                <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Status 200 OK</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Latency: {requestTime} ms</span>
                  </div>
                </div>
              )}

              {response ? (
                <JsonViewer data={response} title={`${endpoint.name} Output`} maxHeight="max-h-[600px]" />
              ) : (
                <div className="h-96 rounded-xl border border-slate-800 bg-slate-900/40 p-8 flex flex-col items-center justify-center text-center space-y-3">
                  <Terminal className="h-10 w-10 text-slate-600" />
                  <h4 className="text-base font-semibold text-slate-300">Ready to execute</h4>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Configure your parameters on the left and click "Execute API Request" to see live responses.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="code" className="space-y-4 mt-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {(["javascript", "typescript", "python", "nodejs"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setActiveSnippetLang(lang)}
                        className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-all ${
                          activeSnippetLang === lang
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-slate-100"
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyCodeSnippet}
                    className="h-8 text-xs text-slate-300 hover:text-emerald-400"
                  >
                    {copiedSnippet ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copiedSnippet ? "Copied!" : "Copy Snippet"}
                  </Button>
                </div>

                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs overflow-auto max-h-[500px]">
                  <pre className="text-emerald-300">
                    {endpoint.codeSnippets[activeSnippetLang] || "// Code snippet available"}
                  </pre>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
