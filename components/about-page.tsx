"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Heart, BookOpen, Users, Code, Coffee, Zap, Layers } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

export function AboutPage() {
  return (
    <motion.div
      className="flex-1 p-6 overflow-y-auto bg-slate-950 text-slate-100"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white">About BooksAPI</h1>
          <p className="text-sm text-slate-400">
            A high-performance, structured API & visual platform for books, series, covers, formats, and batch catalog metadata.
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="border border-slate-800 bg-slate-900/80 text-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center text-emerald-400 gap-2">
                <BookOpen className="h-5 w-5" /> What is BooksAPI?
              </CardTitle>
              <CardDescription className="text-slate-400">Multi-source aggregated metadata engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <p>
                <strong>BooksAPI</strong> combines structured metadata from primary sources including <strong>Hardcover</strong>, <strong>ISBNDB</strong>, and <strong>OpenLibrary</strong>. It provides unified JSON endpoints for book search, detailed metadata with role-split contributors (authors, translators, illustrators, narrators, editors), high-resolution cover image galleries with dominant color swatches, series reading orders, and batch import resolution.
              </p>
            </CardContent>
          </Card>

          <Card className="border border-slate-800 bg-slate-900/80 text-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center text-indigo-400 gap-2">
                <Layers className="h-5 w-5" /> Key Architectural Features
              </CardTitle>
              <CardDescription className="text-slate-400">Built for developers and book applications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                <li><strong>Aggregate Multi-Source Mode</strong>: Multi-provider query merging with canonical work re-ranking.</li>
                <li><strong>Batch Search Import</strong>: Search up to 50 items in a single <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">POST /api/book/batch-search</code> payload with Redis caching & concurrency controls.</li>
                <li><strong>Role-Separated Contributors</strong>: Distinct arrays for translators, narrators, illustrators, and editors.</li>
                <li><strong>High-Res Cover Metrics</strong>: Pixel counts, aspect ratios, format labels, and color swatches for cover galleries.</li>
                <li><strong>Series Reading Order Visualizer</strong>: Deduplicated series position mapping with language & compilation filtering.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border border-slate-800 bg-slate-900/80 text-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center text-purple-400 gap-2">
                <GitBranch className="h-5 w-5" /> Open Source & Community
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <p>
                BooksAPI is open-source and easy to self-host with Next.js, Prisma, and Redis.
              </p>
              <div className="flex gap-4">
                <Button variant="outline" className="border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800" asChild>
                  <Link href="https://github.com" target="_blank">
                    <ExternalLink className="mr-2 h-4 w-4" /> GitHub Repository
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
