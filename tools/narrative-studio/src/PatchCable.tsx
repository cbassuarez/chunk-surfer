import { useLayoutEffect, useRef } from 'react';
import { BaseEdge, EdgeText, Handle, Position } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { drawPatchSocket, patchCableCurve, PATCH_COLORS } from '../../../src/render/patchbay-material.js';

export const CABLE_COLORS: Record<string, string> = { next: PATCH_COLORS.rig, sequence: PATCH_COLORS.rig, check: PATCH_COLORS.recorder, ownership: PATCH_COLORS.fork, return: PATCH_COLORS.torch, exit: PATCH_COLORS.nerve, unresolved: PATCH_COLORS.recorder, revisit: PATCH_COLORS.radio };
export function PatchPort({ id, type, position, kind = 'next', disabled = false, title }: { id?: string; type: 'source' | 'target'; position: Position; kind?: string; disabled?: boolean; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current!, dpr = window.devicePixelRatio || 1;
    canvas.width = 22 * dpr; canvas.height = 22 * dpr;
    const ctx = canvas.getContext('2d');
    drawPatchSocket(ctx, 11 * dpr, 11 * dpr, 7 * dpr, { color: CABLE_COLORS[kind], dpr, available: !disabled });
  }, [kind, disabled]);
  return <Handle id={id} type={type} position={position} isConnectable={!disabled} className={`patch-port patch-port--${kind}`} title={title} aria-label={title}><canvas ref={ref} aria-hidden="true" data-renderer="drawPatchSocket" /></Handle>;
}
export function PatchCable(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data, label, markerEnd, selected } = props;
  const kind = String(data?.kind || 'next'), color = CABLE_COLORS[kind] || CABLE_COLORS.next;
  const curve = patchCableCurve({ x: sourceX, y: sourceY, axis: { x: 1, y: 0 } }, { x: targetX, y: targetY, axis: { x: -1, y: 0 } }, {});
  const sections = curve.sections || [curve];
  const path = `M ${sourceX} ${sourceY} ` + sections.map(section => `C ${section.c1.x} ${section.c1.y} ${section.c2.x} ${section.c2.y} ${section.to.x} ${section.to.y}`).join(' ');
  return <>
    <path d={path} fill="none" stroke="#070b08" strokeWidth={selected ? 8 : 6} className="patch-cable-shadow" style={{ stroke: '#070b08', strokeWidth: selected ? 8 : 6, pointerEvents: 'none' }} />
    <BaseEdge id={props.id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 4 : 2.7, strokeDasharray: kind === 'return' ? '9 4' : kind === 'revisit' || data?.conditional ? '3 4' : undefined }} interactionWidth={22} />
    <path d={path} fill="none" stroke="#f3efcc" strokeOpacity=".18" strokeWidth=".65" style={{ pointerEvents: 'none', stroke: '#f3efcc', strokeWidth: .65 }} />
    {label && <EdgeText x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2 - 12} label={label} labelBgPadding={[5, 3]} labelBgBorderRadius={2} />}
  </>;
}
