"use client";

import { useMemo, useState } from "react";
import { APP_NAME } from "@/lib/constants";
import type { Conversation } from "@/lib/types";
import type { WorkspaceView } from "@/lib/intelligence/types";
import { ActivityIcon, BuildingIcon, ChatIcon, CloseIcon, DashboardIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon } from "@/components/ui/icons";

export function Sidebar({
  view,
  conversations,
  activeId,
  open,
  onClose,
  onNavigate,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onSettings,
}: {
  view: WorkspaceView;
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSettings: () => void;
}) {
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return conversations;
    return conversations.filter((item) => item.title.toLowerCase().includes(value));
  }, [conversations, search]);

  function navigate(next: WorkspaceView) { onNavigate(next); onClose(); }

  return (
    <>
      <div className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark">AI</div>
            <span>{APP_NAME}</span>
            <button className="icon-button mobile-only" onClick={onClose} aria-label="Close sidebar"><CloseIcon /></button>
          </div>
          <nav className="workspace-nav" aria-label="Workspace">
            <NavButton active={view === "dashboard"} icon={<DashboardIcon size={17} />} label="Dashboard" onClick={() => navigate("dashboard")} />
            <NavButton active={view === "competitors"} icon={<BuildingIcon size={17} />} label="Competitors" onClick={() => navigate("competitors")} />
            <NavButton active={view === "changes"} icon={<ActivityIcon size={17} />} label="Changes" onClick={() => navigate("changes")} />
            <NavButton active={view === "chat"} icon={<ChatIcon size={17} />} label="AI Chat" onClick={() => navigate("chat")} />
          </nav>
          <button className="new-chat-button" onClick={() => { onNew(); navigate("chat"); }}><PlusIcon size={18} /> New chat</button>
          {view === "chat" && <label className="search-box"><SearchIcon size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" /></label>}
        </div>

        <div className="conversation-list">
          <div className="section-label">Chats</div>
          {filtered.length === 0 ? <div className="empty-sidebar">No conversations</div> : filtered.map((item) => (
            <div className={`conversation-row ${view === "chat" && item.id === activeId ? "active" : ""}`} key={item.id}>
              <button className="conversation-main" onClick={() => { onSelect(item.id); navigate("chat"); }} title={item.title}><span>{item.title}</span></button>
              <button className="icon-button subtle conversation-menu" onClick={() => setMenuId(menuId === item.id ? null : item.id)} aria-label="Conversation menu"><MoreIcon size={18} /></button>
              {menuId === item.id && <div className="context-menu">
                <button onClick={() => { const next = window.prompt("Rename conversation", item.title)?.trim(); if (next) onRename(item.id, next); setMenuId(null); }}>Rename</button>
                <button className="danger" onClick={() => { onDelete(item.id); setMenuId(null); }}><TrashIcon size={16} /> Delete</button>
              </div>}
            </div>
          ))}
        </div>

        <div className="sidebar-footer"><button className="sidebar-settings" onClick={onSettings}><SettingsIcon size={18} /><span>Settings</span></button></div>
      </aside>
    </>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`workspace-nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}
