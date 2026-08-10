"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export function ChangelogPage() {
  return (
    <motion.div
      className="flex-1 p-6 overflow-y-auto bg-slate-950 text-slate-100"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white">BooksAPI Changelog</h1>
          <p className="text-sm text-slate-400">
            Version history and release notes for BooksAPI.
          </p>
        </div>

        <div className="space-y-6">
          <div className="relative pl-6 border-l-2 border-emerald-500/50 space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">v1.0.0</h2>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Latest Release</Badge>
            </div>

            <Card className="border border-slate-800 bg-slate-900/80 text-slate-200">
              <CardHeader>
                <CardTitle className="text-emerald-400 text-base">Major Frontend Refactor & Multi-Source Upgrade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Complete Frontend Refactor</strong>: Launched the dual-experience UI with the visual <strong>Book & Series Explorer</strong> and <strong>Enterprise API Studio</strong>.</li>
                  <li><strong>Project Renaming</strong>: Rebranded project across codebase and documentation to <strong>BooksAPI</strong>.</li>
                  <li><strong>Batch Search Endpoint</strong>: Added <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">POST /api/book/batch-search</code> allowing up to 50 books per request.</li>
                  <li><strong>Role-Split Contributors</strong>: Separate arrays for Authors, Translators, Illustrators, Narrators, and Editors.</li>
                  <li><strong>High-Res Cover Gallery</strong>: Edition covers with resolution metrics, ratio, and dominant color palette.</li>
                  <li><strong>Series Reading Order Visualizer</strong>: Deduplicated series position navigation.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
