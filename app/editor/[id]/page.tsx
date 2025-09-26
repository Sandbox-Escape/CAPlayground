"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EditorProvider } from "@/components/editor/editor-context";
import { MenuBar } from "@/components/editor/menu-bar";
import { LayersPanel } from "@/components/editor/layers-panel";
import { StatesPanel } from "@/components/editor/states-panel";
import { Inspector } from "@/components/editor/inspector";
import { CanvasPreview } from "@/components/editor/canvas-preview";
import EditorOnboarding from "@/components/editor/onboarding";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;

  const [meta, setMeta] = useState<{ id: string; name: string; width: number; height: number; background?: string } | null>(null);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(400);
  const [statesHeight, setStatesHeight] = useState(350);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectId) return;
    try {
      const listRaw = localStorage.getItem("caplayground-projects");
      const list = listRaw ? JSON.parse(listRaw) as Array<{ id: string; name: string; width?: number; height?: number }> : [];
      const p = list.find((x) => x.id === projectId);
      if (!p) {
        router.replace("/projects");
        return;
      }
      setMeta({ id: p.id, name: p.name, width: p.width ?? 390, height: p.height ?? 844 });
    } catch {
      router.replace("/projects");
    }
  }, [projectId]);

  if (!projectId || !meta) return null;

  return (
    <EditorProvider initialMeta={meta} projectId={projectId}>
      <div className="flex flex-col h-[calc(100vh)]" ref={containerRef}>
        <MenuBar
          projectId={projectId}
          showLeft={showLeft}
          showRight={showRight}
          toggleLeft={() => setShowLeft((v) => !v)}
          toggleRight={() => setShowRight((v) => !v)}
        />
        <div className="flex-1 px-4 py-4 overflow-hidden">
          <div className="h-full w-full flex gap-0">
            {showLeft && (
              <>
                <div className="min-h-0 flex-shrink-0" style={{ width: leftWidth }}>
                  <div className="h-full flex flex-col pr-1" ref={leftPaneRef}>
                    <div className="min-h-[160px] overflow-auto" style={{ flex: "1 1 auto" }}>
                      <LayersPanel />
                    </div>
                    <div
                      className="relative w-full h-2 cursor-row-resize flex-shrink-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const start = statesHeight;
                        const RESIZER = 2;
                        const MIN_TOP = 140;
                        const MIN_BOTTOM = 120;
                        const paneEl = leftPaneRef.current;
                        const total = paneEl ? paneEl.getBoundingClientRect().height : 0;
                        const onMove = (ev: MouseEvent) => {
                          const dy = ev.clientY - startY;
                          let next = start - dy;
                          if (total > 0) {
                            const maxBottom = Math.max(MIN_BOTTOM, total - MIN_TOP - RESIZER);
                            next = Math.max(MIN_BOTTOM, Math.min(maxBottom, next));
                          } else {
                            next = Math.max(MIN_BOTTOM, next);
                          }
                          setStatesHeight(next);
                        };
                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                      aria-label="Resize layers/states panels"
                    />
                    <div className="min-h-[120px] overflow-auto" style={{ flex: `0 0 ${statesHeight}px` }}>
                      <StatesPanel />
                    </div>
                  </div>
                </div>
                <div
                  className="relative w-2 mx-0 h-full self-stretch cursor-col-resize flex-shrink-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const start = leftWidth;
                    const onMove = (ev: MouseEvent) => {
                      const dx = ev.clientX - startX;
                      const next = Math.max(240, Math.min(560, start + dx));
                      setLeftWidth(next);
                    };
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                  aria-label="Resize left column"
                />
              </>
            )}
            <div className="min-h-0 flex-1">
              <CanvasPreview />
            </div>
            {showRight && (
              <>
                <div
                  className="relative w-2 mx-0 h-full self-stretch cursor-col-resize flex-shrink-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startX = e.clientX;
                    const start = rightWidth;
                    const onMove = (ev: MouseEvent) => {
                      const dx = startX - ev.clientX;
                      const next = Math.max(260, Math.min(560, start + dx));
                      setRightWidth(next);
                    };
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                  aria-label="Resize right column"
                />
                <div className="min-h-0 flex-shrink-0" style={{ width: rightWidth }}>
                  <Inspector />
                </div>
              </>
            )}
          </div>
        </div>
        {/* Onboarding overlay (portal) */}
        <EditorOnboarding showLeft={showLeft} showRight={showRight} />
      </div>
    </EditorProvider>
  );
}
