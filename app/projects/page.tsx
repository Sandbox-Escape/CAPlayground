"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Trash2, Edit3, Plus, Folder, Check, Upload, User, LogOut, LayoutDashboard, ArrowLeft } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type React from "react";
import type { AnyLayer, CAProject } from "@/lib/ca/types";
import { unpackCA } from "@/lib/ca/ca-file";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  name: string;
  createdAt: string;
  width?: number;
  height?: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useLocalStorage<Project[]>("caplayground-projects", []);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rootWidth, setRootWidth] = useState<number>(390);
  const [rootHeight, setRootHeight] = useState<number>(844);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const router = useRouter();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [isTosOpen, setIsTosOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [previews, setPreviews] = useState<Record<string, { bg: string; width?: number; height?: number }>>({});
  const [thumbDocs, setThumbDocs] = useState<Record<string, { meta: Pick<CAProject, 'id' | 'name' | 'width' | 'height' | 'background'>; layers: AnyLayer[] }>>({});
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "7" | "30" | "year">("all");
  const [sortBy, setSortBy] = useState<"recent" | "name-asc" | "name-desc">("recent");

  const projectsArray = Array.isArray(projects) ? projects : [];

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      const hasSession = !!data.session;
      setIsSignedIn(hasSession);
      try {
        const accepted = localStorage.getItem("caplayground-tos-accepted") === "true";
        if (!hasSession && !accepted) setIsTosOpen(true);
      } catch {
        if (!hasSession) setIsTosOpen(true);
      }
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setIsSignedIn(false);
  };

  const recordProjectCreated = () => {
    try { fetch("/api/analytics/project-created", { method: "POST", keepalive: true }).catch(() => {}); } catch {}
  };

  useEffect(() => {
    try {
      const map: Record<string, { bg: string; width?: number; height?: number }> = {};
      const docs: Record<string, { meta: { id: string; name: string; width: number; height: number; background: string }; layers: AnyLayer[] }> = {};
      for (const p of projectsArray) {
        const key = `caplayground-project:${p.id}`;
        const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const meta = parsed?.meta ?? {};
            const bg = typeof meta.background === 'string' ? meta.background : '#e5e7eb';
            const width = Number(meta.width) || p.width;
            const height = Number(meta.height) || p.height;
            map[p.id] = { bg, width, height };
            const layers = Array.isArray(parsed?.layers) ? (parsed.layers as AnyLayer[]) : [];
            docs[p.id] = { meta: { id: p.id, name: p.name, width: width || 390, height: height || 844, background: bg }, layers };
          } catch {}
        } else {
          map[p.id] = { bg: '#e5e7eb', width: p.width, height: p.height };
          docs[p.id] = { meta: { id: p.id, name: p.name, width: p.width || 390, height: p.height || 844, background: '#e5e7eb' }, layers: [] };
        }
      }
      setPreviews(map);
      setThumbDocs(docs);
    } catch {}
  }, [projectsArray]);

  const filteredProjects = useMemo(() => {
    const now = new Date();
    const matchesQuery = (name: string) => query.trim() === "" || name.toLowerCase().includes(query.trim().toLowerCase());
    const inDateRange = (createdAt: string) => {
      if (dateFilter === "all") return true;
      const created = new Date(createdAt);
      if (Number.isNaN(created.getTime())) return true;
      switch (dateFilter) {
        case "7": { const d = new Date(now); d.setDate(d.getDate() - 7); return created >= d; }
        case "30": { const d = new Date(now); d.setDate(d.getDate() - 30); return created >= d; }
        case "year": return created.getFullYear() === now.getFullYear();
        default: return true;
      }
    };
    const arr = projectsArray.filter((p) => matchesQuery(p.name) && inDateRange(p.createdAt));
    const sorted = [...arr].sort((a, b) => {
      if (sortBy === "recent") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      return 0;
    });
    return sorted;
  }, [projectsArray, query, dateFilter, sortBy]);

  const createProject = () => {
    if (newProjectName.trim() === "") return;
    const newProject: Project = { id: Date.now().toString(), name: newProjectName.trim(), createdAt: new Date().toISOString() };
    setProjects([...projectsArray, newProject]);
    recordProjectCreated();
    setNewProjectName("");
  };

  const createProjectFromDialog = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const w = Number(rootWidth);
    const h = Number(rootHeight);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const newProject: Project = { id: Date.now().toString(), name, createdAt: new Date().toISOString(), width: Math.round(w), height: Math.round(h) };
    setProjects([...projectsArray, newProject]);
    recordProjectCreated();
    setNewProjectName("");
    setRootWidth(390);
    setRootHeight(844);
    setIsCreateOpen(false);
  };

  const startEditing = (project: Project) => { setEditingProjectId(project.id); setEditingName(project.name); setIsRenameOpen(true); };
  const saveEdit = () => {
    if (editingProjectId === null || editingName.trim() === "") return;
    setProjects(projectsArray.map((project) => (project.id === editingProjectId ? { ...project, name: editingName.trim() } : project)));
    try {
      const key = `caplayground-project:${editingProjectId}`;
      const current = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (current) { const parsed = JSON.parse(current); if (parsed?.meta) parsed.meta.name = editingName.trim(); localStorage.setItem(key, JSON.stringify(parsed)); }
    } catch {}
    setEditingProjectId(null); setEditingName(""); setIsRenameOpen(false);
  };

  const deleteProject = (id: string) => { setProjects(projectsArray.filter((project) => project.id !== id)); };
  const confirmDelete = (id: string) => { setPendingDeleteId(id); setIsDeleteOpen(true); };
  const toggleSelectMode = () => { setIsSelectMode((v) => { const next = !v; if (!next) setSelectedIds([]); return next; }); };
  const toggleSelection = (id: string) => { setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); };
  const openBulkDelete = () => setIsBulkDeleteOpen(true);
  const performBulkDelete = () => { if (selectedIds.length === 0) return; setProjects(projectsArray.filter((p) => !selectedIds.includes(p.id))); setSelectedIds([]); setIsSelectMode(false); setIsBulkDeleteOpen(false); };

  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === "Enter") { createProjectFromDialog(); } };
  const handleEditKeyPress = (e: React.KeyboardEvent) => { if (e.key === "Enter") { saveEdit(); } else if (e.key === "Escape") { setEditingProjectId(null); setEditingName(""); } };

  const handleImportClick = () => importInputRef.current?.click();
  const handleImportChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    try {
      const file = e.target.files?.[0]; if (!file) return;
      const bundle = await unpackCA(file);
      const id = Date.now().toString();
      const name = bundle.project.name || "Imported Project";
      const width = Math.round(bundle.project.width || (bundle.root?.size?.w ?? 0));
      const height = Math.round(bundle.project.height || (bundle.root?.size?.h ?? 0));
      const newProj: Project = { id, name, createdAt: new Date().toISOString(), width, height };
      setProjects([...(projectsArray || []), newProj]);
      recordProjectCreated();
      const root = bundle.root as any;
      const layers = root?.type === 'group' && Array.isArray(root.children) ? root.children : root ? [root] : [];
      const importedStates = Array.isArray(bundle.states) ? bundle.states.filter((n) => !/^base(\s*state)?$/i.test((n || '').trim())) : [];
      const doc = { meta: { id, name, width, height, background: root?.backgroundColor ?? '#e5e7eb' }, layers, selectedId: null, states: importedStates.length > 0 ? importedStates : ["Locked", "Unlock", "Sleep"], stateOverrides: bundle.stateOverrides || {}, stateTransitions: bundle.stateTransitions || [] };
      try { localStorage.setItem(`caplayground-project:${id}`, JSON.stringify(doc)); } catch {}
      router.push(`/editor/${id}`);
    } catch (err) { console.error('Import failed', err); } finally { if (importInputRef.current) importInputRef.current.value = ''; }
  };

  function ProjectThumb({ doc }: { doc: { meta: Pick<CAProject, 'id' | 'name' | 'width' | 'height' | 'background'>; layers: AnyLayer[] } }) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
      const el = wrapRef.current; if (!el) return;
      const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setWrapSize({ w: Math.round(r.width), h: Math.round(r.height) }); });
      ro.observe(el); return () => ro.disconnect();
    }, []);
    const w = doc.meta.width || 390; const h = doc.meta.height || 844;
    const s = wrapSize.w > 0 && wrapSize.h > 0 ? Math.min(wrapSize.w / w, wrapSize.h / h) : 1;
    const ox = (wrapSize.w - w * s) / 2; const oy = (wrapSize.h - h * s) / 2;
    const renderLayer = (l: AnyLayer): React.ReactNode => {
      const common: React.CSSProperties = { position: 'absolute', left: l.position.x, top: l.position.y, width: l.size.w, height: l.size.h, transform: `rotate(${(l as any).rotation ?? 0}deg)`, opacity: (l as any).opacity ?? 1, display: (l as any).visible === false ? 'none' as any : undefined, overflow: 'hidden' };
      if (l.type === 'text') { const t = l as any; return <div key={l.id} style={{ ...common, color: t.color, fontSize: t.fontSize, textAlign: t.align }}>{t.text}</div>; }
      if (l.type === 'image') { const im = l as any; return <img key={l.id} alt={im.name} draggable={false} style={{ ...common, objectFit: (im as any).contentMode || 'cover' }} />; }
      if (l.type === 'shape') { const s = l as any; const corner = (s.cornerRadius ?? s.radius) ?? 0; const borderRadius = s.shape === 'circle' ? 9999 : corner; const style: React.CSSProperties = { ...common, background: s.fill, borderRadius }; if (s.borderColor && s.borderWidth) { style.border = `${Math.max(0, Math.round(s.borderWidth))}px solid ${s.borderColor}`; } return <div key={l.id} style={style} />; }
      if ((l as any).type === 'group') { const g = l as any; return (<div key={g.id} style={{ ...common, background: g.backgroundColor }}>{Array.isArray(g.children) ? g.children.map((c: AnyLayer) => renderLayer(c)) : null}</div>); }
      return null;
    };
    return (
      <div className="w-full h-full relative bg-background" ref={wrapRef}>
        <div className="absolute" style={{ width: w, height: h, background: doc.meta.background ?? '#e5e7eb', transform: `translate(${ox}px, ${oy}px) scale(${s})`, transformOrigin: 'top left', borderRadius: 4, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)' }}>
          {(
