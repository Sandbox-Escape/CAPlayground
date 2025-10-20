import React, { useEffect, useRef } from 'react';
import {
  CAEmitterLayer, CAEmitterCell,
} from './emitter';
import { EmitterLayer } from '@/lib/ca/types';

const loadImage = (src: string) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export function EmitterCanvas({ paused = false, layer: emitterLayer, assets }: { paused?: boolean; layer: EmitterLayer, assets?: Record<string, { dataURL?: string }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number>(0);
  const runningRef = useRef(!paused);
  const layerRef = useRef<CAEmitterLayer>(null);
  const startAnimationRef = useRef<(() => void) | null>(null);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => { 
    runningRef.current = !paused;
    if (!paused && layerRef.current && startAnimationRef.current) {
      startAnimationRef.current();
    }
  }, [paused]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, -1, 0, canvas.height);
    const layer = new CAEmitterLayer();
    layer.emitterPosition = emitterLayer.emitterPosition;
    layer.emitterSize = emitterLayer.emitterSize;
    layer.emitterShape = emitterLayer.emitterShape || layer.emitterShape;
    layer.emitterMode = emitterLayer.emitterMode || layer.emitterMode;
    layerRef.current = layer;

    const loadCells = async () => {
      const cellPromises = emitterLayer.emitterCells?.map(async (cell) => {
        const src = assets?.[cell.id]?.dataURL;
        const img = src ? await loadImage(src) : null;
        const newCell = new CAEmitterCell();
        newCell.name = cell.id;
        newCell.contents = img;
        newCell.birthRate = reduceMotion ? 0 : cell.birthRate;
        newCell.lifetime = cell.lifetime;
        newCell.velocity = cell.velocity;
        newCell.emissionRange = Math.PI * cell.emissionRange / 180;
        newCell.scale = cell.scale;
        newCell.spin = Math.PI * cell.spin / 180;
        newCell.yAcceleration = cell.yAcceleration || 0;
        newCell.xAcceleration = cell.xAcceleration || 0;
        return newCell;
      }) || [];

      const loadedCells = await Promise.all(cellPromises);
      layer.emitterCells.push(...loadedCells);

      if (runningRef.current) {
        startAnimation();
      }
    };

    const startAnimation = () => {
      cancelAnimationFrame(rafIdRef.current);
      
      let last = performance.now();

      const tick = (now: number) => {
        if (!runningRef.current) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        layerRef.current?.step(dt);
        layerRef.current?.draw(ctx);

        rafIdRef.current = requestAnimationFrame(tick);
      };
      
      rafIdRef.current = requestAnimationFrame(tick);
    };

    startAnimationRef.current = startAnimation;

    loadCells();

    const onVis = () => {
      runningRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [JSON.stringify(emitterLayer)]);

  return (
    <canvas
      ref={canvasRef}
      width={emitterLayer.size.w}
      height={emitterLayer.size.h}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'block',
        pointerEvents: 'none',
        background: 'transparent'
      }}
    />
  );
}
