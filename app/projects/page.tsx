"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Project, AnyLayer } from '@/types';
import { unpackCA } from '@/lib/ca-format';

// Local keys
const PROJECT_INDEX_KEY = 'caplayground-project-index:v2';
const PROJECT_KEY = (id: string) => `caplayground-project:${id}`;

// Helper to load/save project list locally
function loadProjectIndex(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECT_INDEX_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}
function saveProjectIndex(list: Project[]) {
  try {
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(list));
  } catch {}
}

export default function ProjectsPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);

  // state
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateReason, setUpdateReason] = useState<string>('');

  // Load local projects on mount; detect outdated/missing
  useEffect(() => {
    const list = loadProjectIndex();
    setProjects(Array.isArray(list) ? list : []);

    // Simple heuristic: ensure each listed project has a corresponding doc
    const missing = list.find(p => !localStorage.getItem(PROJECT_KEY(p.id)));
    if (!list.length || missing) {
      setUpdateReason(!list.length ? 'No local projects found.' : 'Some local project data is missing.');
      setShowUpdatePrompt(true);
    }
  }, []);

  // Persist index when projects change
  useEffect(() => {
    saveProjectIndex(projects);
  }, [projects]);

  const createProject = () => {
    if (!newProjectName.trim()) return;
    const id = Date.now().toString();
    const proj: Project = {
      id,
      name: newProjectName.trim(),
      createdAt: new Date().toISOString(),
      width: 390,
      height: 844,
    } as any;

    const doc = {
      meta: { id, name: proj.name, width: 390, height: 844, background: '#e5e7eb' },
      layers: [],
      selectedId: null,
      states: ['Locked', 'Unlock', 'Sleep'],
      stateOverrides: {},
      stateTransitions: [],
    };

    try { localStorage.setItem(PROJECT_KEY(id), JSON.stringify(doc)); } catch {}
    setProjects(prev => [...prev, proj]);
    setIsCreateOpen(false);
    setNewProjectName('');
    router.push(`/editor/${id}`);
  };

  const confirmDelete = (id: string) => { setPendingDeleteId(id); setIsDeleteOpen(true); };
  const doDelete = () => {
    if (!pendingDeleteId) return;
    try { localStorage.removeItem(PROJECT_KEY(pendingDeleteId)); } catch {}
    setProjects(prev => prev.filter(p => p.id !== pendingDeleteId));
    setPendingDeleteId(null);
    setIsDeleteOpen(false);
  };

  const handleImportClick = () => importInputRef.current?.click();
  const handleImportChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const bundle = await unpackCA(file);
      const id = Date.now().toString();
      const name = bundle.project?.name || 'Imported Project';
      const width = Math.round(bundle.project?.width || (bundle.root?.size?.w ?? 390));
      const height = Math.round(bundle.project?.height || (bundle.root?.size?.h ?? 844));

      const proj: Project = { id, name, createdAt: new Date().toISOString(), width, height } as any;

      const root = bundle.root as any;
      const layers = root?.type === 'group' && Array.isArray(root.children) ? root.children : root ? [root] : [];
      const importedStates = Array.isArray(bundle.states)
        ? bundle.states.filter((n) => !/^base(\s*state)?$/i.test((n || '').trim()))
        : [];

      const doc = {
        meta: { id, name, width, height, background: root?.backgroundColor ?? '#e5e7eb' },
        layers,
        selectedId: null,
        states: importedStates.length > 0 ? importedStates : ['Locked', 'Unlock', 'Sleep'],
        stateOverrides: bundle.stateOverrides || {},
        stateTransitions: bundle.stateTransitions || [],
      };

      try { localStorage.setItem(PROJECT_KEY(id), JSON.stringify(doc)); } catch {}
      setProjects(prev => [...prev, proj]);
      router.push(`/editor/${id}`);
    } catch (err) {
      console.error('Import failed', err);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  // Update/import prompt actions
  const handleUpdateFromFile = () => handleImportClick();
  const handleDismissUpdate = () => setShowUpdatePrompt(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Update/Import prompt */}
        {showUpdatePrompt && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold mb-1">Local data needs attention</h2>
                <p className="text-sm text-muted-foreground">{updateReason} Import a .ca file to populate or update your local projects.</p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={handleDismissUpdate}>Dismiss</button>
                <button className="btn btn-primary" onClick={handleUpdateFromFile}>Import</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={handleImportClick}>Import .ca</button>
            <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>New Project</button>
          </div>
        </div>

        <input type="file" ref={importInputRef} onChange={handleImportChange} accept=".ca" className="hidden" />

        {projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>Create your first project</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div className="card p-4" key={project.id}>
                <div className="aspect-[9/16] mb-4 bg-muted rounded overflow-hidden flex items-center justify-center text-sm text-muted-foreground">
                  {project.width}×{project.height}
                </div>
                <h3 className="font-semibold mb-2">{project.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">Created {new Date(project.createdAt as any).toLocaleDateString()}</p>
                <div className="flex gap-2">
                  <button onClick={() => router.push(`/editor/${project.id}`)} className="btn btn-primary flex-1">Open</button>
                  <button onClick={() => confirmDelete(project.id)} className="btn btn-destructive">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Simple create dialog */}
        {isCreateOpen && (
          <div className="fixed inset-0 bg-black/40 grid place-items-center p-4">
            <div className="bg-background border rounded-lg p-4 w-full max-w-sm">
              <h2 className="font-semibold mb-2">New Project</h2>
              <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Project name" className="w-full input mb-4" />
              <div className="flex justify-end gap-2">
                <button className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createProject}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Simple delete confirm */}
        {isDeleteOpen && (
          <div className="fixed inset-0 bg-black/40 grid place-items-center p-4">
            <div className="bg-background border rounded-lg p-4 w-full max-w-sm">
              <h2 className="font-semibold mb-2">Delete project?</h2>
              <p className="text-sm text-muted-foreground mb-4">This only affects your local data.</p>
              <div className="flex justify-end gap-2">
                <button className="btn btn-secondary" onClick={() => setIsDeleteOpen(false)}>Cancel</button>
                <button className="btn btn-destructive" onClick={doDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
