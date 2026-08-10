"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Navbar, type NavTab } from "@/components/navbar";
import { AdminPortal } from "@/components/admin/admin-portal";
import { endpoints } from "@/lib/api-endpoints";

const ExplorerView = dynamic(
  () => import("@/components/explorer/explorer-view").then((m) => m.ExplorerView),
  { ssr: false }
);
const ApiStudio = dynamic(
  () => import("@/components/api-studio").then((m) => m.ApiStudio),
  { ssr: false }
);
const ApiSidebar = dynamic(
  () => import("@/components/api-sidebar").then((m) => m.ApiSidebar),
  { ssr: false }
);
const ApiDocs = dynamic(
  () => import("@/components/api-docs").then((m) => m.ApiDocs),
  { ssr: false }
);
const ChangelogPage = dynamic(
  () => import("@/components/changelog-page").then((m) => m.ChangelogPage),
  { ssr: false }
);
const AboutPage = dynamic(
  () => import("@/components/about-page").then((m) => m.AboutPage),
  { ssr: false }
);

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>("explorer");

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "admin" && <AdminPortal />}

      {activeTab === "explorer" && (
        <div className="flex-1 flex flex-col">
          <ExplorerView />
        </div>
      )}

      {activeTab === "studio" && (
        <div className="flex-1 flex flex-col">
          <ApiStudio />
        </div>
      )}

      {activeTab === "docs" && (
        <div className="flex flex-1 overflow-hidden">
          <ApiSidebar endpoints={endpoints} />
          <main className="flex-1 overflow-y-auto">
            <ApiDocs />
          </main>
        </div>
      )}

      {activeTab === "changelog" && (
        <div className="flex-1 overflow-y-auto">
          <ChangelogPage />
        </div>
      )}

      {activeTab === "about" && (
        <div className="flex-1 overflow-y-auto">
          <AboutPage />
        </div>
      )}
    </div>
  );
}
