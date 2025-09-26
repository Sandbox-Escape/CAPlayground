"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Project, AnyLayer, CAProject } from '@/types';
import { unpackCA } from '@/lib/ca-format';
import { recordProjectCreated } from '@/lib/analytics';

export default function ProjectsPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const projectsArray = Array.isArray(projects) ? projects : [];

  const createProjectFromDialog = () => {
    if (!newProjectName.trim()) return;
    
    const id = Date.now().toString();
    const newProject: Project = {
      id,
      name: newProjectName.trim(),
      createdAt: new Date().toISOString(),
      width: 390,
      height: 844
    };
    
    setProjects([...projectsArray, newProject]);
    recordProjectCreated();
    
    const doc = {
      meta: { id, name: newProject.name, width: 390, height: 844, background: '#e5e7eb' },
      layers: [],
      selectedId: null,
      states: ["Locked", "Unlock", "Sleep"],
      stateOverrides: {},
      stateTransitions: []
    };
    
    try {
      localStorage.setItem(`caplayground-project:${id}`, JSON.stringify(doc));
    } catch {}
    
    router.push(`/editor/${id}`);
  };

  const saveEdit = () => {
    const key = `caplayground-project:${editingProjectId}`;
    try {
      const current = localStorage.getItem(key);
      if (current) {
        const parsed = JSON.parse(current);
        if (parsed?.meta) parsed.meta.name = editingName.trim();
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {}
    setEditingProjectId(null);
    setEditingName("");
    setIsRenameOpen(false);
  };

  const deleteProject = (id: string) => {
    setProjects(projectsArray.filter((project) => project.id !== id));
  };

  const confirmDelete = (id: string) => {
    setPendingDeleteId(id);
    setIsDeleteOpen(true);
  };

  const toggleSelectMode = () => {
    setIsSelectMode((v) => {
      const next = !v;
      if (!next) setSelectedIds([]);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const openBulkDelete = () => setIsBulkDeleteOpen(true);

  const performBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setProjects(projectsArray.filter((p) => !selectedIds.includes(p.id)));
    setSelectedIds([]);
    setIsSelectMode(false);
    setIsBulkDeleteOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      createProjectFromDialog();
    }
  };

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      setEditingProjectId(null);
      setEditingName("");
    }
  };

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      
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
      
      const doc = {
        meta: { id, name, width, height, background: root?.backgroundColor ?? '#e5e7eb' },
        layers,
        selectedId: null,
        states: importedStates.length > 0 ? importedStates : ["Locked", "Unlock", "Sleep"],
        stateOverrides: bundle.stateOverrides || {},
        stateTransitions: bundle.stateTransitions || []
      };
      
      try {
        localStorage.setItem(`caplayground-project:${id}`, JSON.stringify(doc));
      } catch {}
      
      router.push(`/editor/${id}`);
    } catch (err) {
      console.error('Import failed', err);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  function ProjectThumb({ doc }: { doc: { meta: Pick<CAProject, 'id' | 'name' | 'width' | 'height' | 'background'>; layers: AnyLayer[] } }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
    
    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      
      const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        setWrapSize({ w: Math.round(r.width), h: Math.round(r.height) });
      });
      
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
    
    const w = doc.meta.width || 390;
    const h = doc.meta.height || 844;
    const s = wrapSize.w > 0 && wrapSize.h > 0 ? Math.min(wrapSize.w / w, wrapSize.h / h) : 1;
    const ox = (wrapSize.w - w * s) / 2;
    const oy = (wrapSize.h - h * s) / 2;
    
    const renderLayer = (l: AnyLayer): React.ReactNode => {
      const common: React.CSSProperties = {
        position: 'absolute',
        left: l.position.x,
        top: l.position.y,
        width: l.size.w,
        height: l.size.h,
        transform: `rotate(${(l as any).rotation ?? 0}deg)`,
        opacity: (l as any).opacity ?? 1,
        display: (l as any).visible === false ? 'none' as any : undefined,
        overflow: 'hidden'
      };
      
      if (l.type === 'text') {
        const t = l as any;
        return <div key={l.id} style={{ ...common, color: t.color, fontSize: t.fontSize, textAlign: t.align }}>{t.text}</div>;
      }
      
      if (l.type === 'image') {
        const im = l as any;
        return <img key={l.id} alt={im.name} draggable={false} style={{ ...common, objectFit: (im as any).contentMode || 'cover' }} />;
      }
      
      if (l.type === 'shape') {
        const s = l as any;
        const corner = (s.cornerRadius ?? s.radius) ?? 0;
        const borderRadius = s.shape === 'circle' ? 9999 : corner;
        const style: React.CSSProperties = { ...common, background: s.fill, borderRadius };
        
        if (s.borderColor && s.borderWidth) {
          style.border = `${Math.max(0, Math.round(s.borderWidth))}px solid ${s.borderColor}`;
        }
        
        return <div key={l.id} style={style} />;
      }
      
      if ((l as any).type === 'group') {
        const g = l as any;
        return (
          <div key={g.id} style={{ ...common, background: g.backgroundColor }}>
            {Array.isArray(g.children) ? g.children.map((c: AnyLayer) => renderLayer(c)) : null}
          </div>
        );
      }
      
      return null;
    };
    
    return (
      <div className="w-full h-full relative bg-background" ref={wrapRef}>
        <div className="absolute" style={{
          width: w,
          height: h,
          background: doc.meta.background ?? '#e5e7eb',
          transform: `translate(${ox}px, ${oy}px) scale(${s})`,
          transformOrigin: 'top left',
          borderRadius: 4,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)'
        }}>
          {doc.layers.map(renderLayer)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="flex gap-2">
            <button onClick={handleImportClick} className="btn btn-secondary">
              Import .ca
            </button>
            <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary">
              New Project
            </button>
          </div>
        </div>
        
        <input
          type="file"
          ref={importInputRef}
          onChange={handleImportChange}
          accept=".ca"
          className="hidden"
        />
        
        {projectsArray.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary">
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectsArray.map((project) => (
              <div key={project.id} className="card p-4">
                <div className="aspect-[9/16] mb-4 bg-muted rounded overflow-hidden">
                  <ProjectThumb doc={{
                    meta: {
                      id: project.id,
                      name: project.name,
                      width: project.width,
                      height: project.height,
                      background: '#e5e7eb'
                    },
                    layers: []
                  }} />
                </div>
                <h3 className="font-semibold mb-2">{project.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => router.push(`/editor/${project.id}`)} 
                    className="btn btn-primary flex-1"
                  >
                    Open
                  </button>
                  <button 
                    onClick={() => confirmDelete(project.id)} 
                    className="btn btn-destructive"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
