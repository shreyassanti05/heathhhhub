import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Sparkles, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
// @ts-ignore
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { DrugOrganEffect } from '../types';

// ─── Base color (matches MedicalModel3D exactly) ──────────────────────────────
const BASE_COLOR = new THREE.Color('#e0f2fe');

// ─── Heatmap color: intensity → yellow (low) → orange → red (high) ───────────
function heatColor(t: number): THREE.Color {
    t = Math.max(0, Math.min(1, t));
    const c = new THREE.Color();
    if (t < 0.4) {
        // light yellow → orange
        c.setRGB(1.0, 1.0 - t * 0.5, 0.2 - t * 0.2);
    } else if (t < 0.75) {
        // orange → deep orange
        const s = (t - 0.4) / 0.35;
        c.setRGB(1.0, 0.8 - s * 0.45, 0.05);
    } else {
        // deep orange → red
        const s = (t - 0.75) / 0.25;
        c.setRGB(1.0, 0.35 - s * 0.35, 0.0);
    }
    return c;
}

function heatLabelColor(v: number) {
    if (v < 0.35) return { text: 'Low', hex: '#facc15' };
    if (v < 0.65) return { text: 'Moderate', hex: '#f97316' };
    return { text: 'High', hex: '#ef4444' };
}

// ─── Organ bounding-box zones (Y = bottom→top fraction of model) ──────────────
interface OrganZone {
    yMin: number; yMax: number;
    xMin?: number; xMax?: number; // normalized -0.5–0.5
}

const ORGAN_ZONES: Record<string, OrganZone> = {
    'Brain': { yMin: 0.88, yMax: 1.00 },
    'Nervous System': { yMin: 0.00, yMax: 1.00 },
    'Lungs': { yMin: 0.68, yMax: 0.83 },
    'Heart': { yMin: 0.70, yMax: 0.81, xMin: -0.18, xMax: 0.04 },
    'Liver': { yMin: 0.57, yMax: 0.71, xMin: 0.00, xMax: 0.22 },
    'Stomach': { yMin: 0.57, yMax: 0.69, xMin: -0.22, xMax: 0.04 },
    'Kidney': { yMin: 0.52, yMax: 0.66 },
    'Intestines': { yMin: 0.36, yMax: 0.56 },
    'Muscles': { yMin: 0.00, yMax: 1.00 },
    'Skin': { yMin: 0.00, yMax: 1.00 },
};

function norm(v: number, min: number, max: number) {
    const r = max - min;
    return r === 0 ? 0 : (v - min) / r;
}

const ORGAN_ICONS: Record<string, string> = {
    'Brain': '🧠', 'Heart': '❤️', 'Liver': '🟤', 'Kidney': '🫘',
    'Lungs': '💨', 'Stomach': '🫃', 'Nervous System': '⚡',
    'Muscles': '💪', 'Skin': '🫀', 'Intestines': '🌀',
};

// ─── Inner model — MeshPhysicalMaterial + per-vertex heatmap color ────────────
interface HumanModelProps {
    effects: DrugOrganEffect[];
    onOrganHover: (organ: string | null) => void;
    onOrganClick: (organ: string) => void;
}

const HumanModel: React.FC<HumanModelProps> = ({ effects, onOrganHover, onOrganClick }) => {
    const obj = useLoader(OBJLoader, '/Human.obj');
    const groupRef = useRef<THREE.Group>(null);
    const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const { camera, gl, raycaster } = useThree();

    // Build organ → intensity lookup
    const organMap = useMemo(() => {
        const map: Record<string, number> = {};
        for (const e of effects) {
            const key = Object.keys(ORGAN_ZONES).find(
                k => k.toLowerCase() === e.organ.toLowerCase()
            );
            if (key) map[key] = Math.max(0, Math.min(1, e.intensity));
        }
        return map;
    }, [effects]);

    // ── Attach premium MeshPhysicalMaterial with vertexColors ────────────────
    const mat = useMemo(() => {
        return new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(1, 1, 1),
            metalness: 0.1,
            roughness: 0.4,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1,
            reflectivity: 0.5,
            side: THREE.DoubleSide,
            vertexColors: true,
        });
    }, []);

    useEffect(() => {
        matRef.current = mat;
    }, [mat]);

    useMemo(() => {
        obj.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.material = mat;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const geo = mesh.geometry;
            const count = geo.attributes.position.count;
            if (!geo.attributes.color) {
                const colors = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    colors[i * 3] = BASE_COLOR.r;
                    colors[i * 3 + 1] = BASE_COLOR.g;
                    colors[i * 3 + 2] = BASE_COLOR.b;
                }
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            }
        });
    }, [obj, mat]);

    // ── Fit model — centred at origin ────────────────────────────────────────
    useEffect(() => {
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Move model so its bounding-box centre sits exactly at (0,0,0)
        obj.position.set(-center.x, -center.y + 0.5, -center.z);

        const maxDim = Math.max(size.x, size.y, size.z);
        const s = 3.2 / maxDim;
        obj.scale.set(s, s, s);

        // Point camera straight at the centred model
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
    }, [obj, camera]);

    // ── Update vertex colors when effects change ──────────────────────────────
    useEffect(() => {
        const hasEffects = Object.keys(organMap).length > 0;
        let maxIntensity = 0;

        obj.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;

            const geo = mesh.geometry;
            const posAttr = geo.attributes.position as THREE.BufferAttribute;
            const colAttr = geo.attributes.color as THREE.BufferAttribute;
            if (!colAttr) return;

            const count = posAttr.count;
            const cols = colAttr.array as Float32Array;

            // Get local bounding box for normalization
            const bbox = new THREE.Box3().setFromBufferAttribute(posAttr);
            const bSize = bbox.getSize(new THREE.Vector3());
            const bMin = bbox.min;

            for (let i = 0; i < count; i++) {
                const x = posAttr.getX(i);
                const y = posAttr.getY(i);
                const fy = norm(y, bMin.y, bMin.y + bSize.y);
                const fx = bSize.x === 0 ? 0 : (x - bMin.x) / bSize.x - 0.5;

                let maxHeat = 0;
                if (hasEffects) {
                    for (const [organName, zone] of Object.entries(ORGAN_ZONES)) {
                        const intensity = organMap[organName];
                        if (intensity === undefined) continue;
                        const inY = fy >= zone.yMin && fy <= zone.yMax;
                        const inX = zone.xMin === undefined ? true
                            : (fx * 2 >= zone.xMin && fx * 2 <= zone.xMax);
                        if (inY && inX && intensity > maxHeat) {
                            maxHeat = intensity;
                        }
                    }
                }

                let col: THREE.Color;
                if (maxHeat > 0.005) {
                    col = heatColor(maxHeat);
                    if (maxHeat > maxIntensity) maxIntensity = maxHeat;
                } else {
                    col = BASE_COLOR;
                }

                cols[i * 3] = col.r;
                cols[i * 3 + 1] = col.g;
                cols[i * 3 + 2] = col.b;
            }
            colAttr.needsUpdate = true;
        });

        if (matRef.current) {
            if (maxIntensity > 0) {
                matRef.current.emissive.copy(heatColor(maxIntensity));
                matRef.current.emissiveIntensity = maxIntensity * 0.2;
            } else {
                matRef.current.emissive.setRGB(0, 0, 0);
                matRef.current.emissiveIntensity = 0;
            }
        }
    }, [organMap, obj]);

    // ── Animate — no auto-spin, only pulse the emissive glow ────────────────
    useFrame((state) => {
        if (matRef.current && matRef.current.emissiveIntensity > 0) {
            const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3);
            const maxI = Math.max(0, ...Object.values(organMap));
            matRef.current.emissiveIntensity = maxI * 0.2 * pulse;
        }
    });

    // ── Pointer detection ─────────────────────────────────────────────────────
    const getOrgan = useCallback((e: PointerEvent): string | null => {
        const rect = gl.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(mouse, camera);
        const hits: THREE.Intersection[] = [];
        obj.traverse(c => { if ((c as THREE.Mesh).isMesh) hits.push(...raycaster.intersectObject(c, false)); });
        if (!hits.length) return null;
        hits.sort((a, b) => a.distance - b.distance);
        const pt = hits[0].point;
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const fy = norm(pt.y, box.min.y, box.min.y + size.y);
        const fx = norm(pt.x, box.min.x, box.min.x + size.x) - 0.5;

        let best: string | null = null;
        let bestScore = -1;
        for (const [organName, zone] of Object.entries(ORGAN_ZONES)) {
            if (!organMap[organName]) continue;
            const inY = fy >= zone.yMin && fy <= zone.yMax;
            const inX = zone.xMin === undefined ? true
                : (fx * 2 >= zone.xMin && fx * 2 <= zone.xMax);
            if (inY && inX && organMap[organName] > bestScore) {
                bestScore = organMap[organName];
                best = organName;
            }
        }
        return best;
    }, [obj, camera, raycaster, gl, organMap]);

    useEffect(() => {
        const el = gl.domElement;
        let last: string | null = null;
        const onMove = (e: PointerEvent) => {
            const o = getOrgan(e);
            if (o !== last) { last = o; onOrganHover(o); }
        };
        const onClick = (e: PointerEvent) => {
            const o = getOrgan(e);
            if (o) onOrganClick(o);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('click', onClick as EventListener);
        return () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('click', onClick as EventListener);
        };
    }, [gl, getOrgan, onOrganHover, onOrganClick]);

    return <group ref={groupRef}><primitive object={obj} /></group>;
};

// ─── Exported DrugHeatmap3D ───────────────────────────────────────────────────
export interface DrugHeatmap3DProps {
    effects: DrugOrganEffect[];
    selectedOrgan: string | null;
    onOrganSelect: (organ: string) => void;
    isAnalyzing?: boolean;
}

const DrugHeatmap3D: React.FC<DrugHeatmap3DProps> = ({
    effects, selectedOrgan, onOrganSelect, isAnalyzing
}) => {
    const [hoveredOrgan, setHoveredOrgan] = useState<string | null>(null);
    const hoveredEffect = effects.find(e => e.organ.toLowerCase() === hoveredOrgan?.toLowerCase());

    return (
        <div className="relative w-full h-full select-none">
            {/* ── Three.js Canvas — identical structure to MedicalModel3D ── */}
            <Canvas shadows dpr={[1, 2]} style={{ background: 'transparent' }}>
                <fog attach="fog" args={['#0f172a', 10, 25]} />

                {/* Lighting — exact match to MedicalModel3D */}
                <ambientLight intensity={0.7} color="#ffffff" />
                <spotLight position={[10, 10, 10]} angle={0.2} penumbra={1}
                    intensity={1.2} castShadow shadow-mapSize={[780, 780]} color="#ffffff" />
                <pointLight position={[-10, 0, -10]} intensity={1.5} color="#3b82f6" />
                <spotLight position={[0, 5, -5]} intensity={2} color="#06b6d4" />

                <React.Suspense fallback={null}>
                    <HumanModel
                        effects={effects}
                        onOrganHover={setHoveredOrgan}
                        onOrganClick={onOrganSelect}
                    />
                </React.Suspense>

                <Sparkles count={30} scale={8} size={2} speed={0.5} opacity={0.4} color="#bae6fd" />
                <Environment preset="city" blur={1} />
                <ContactShadows resolution={512} scale={20} blur={2} opacity={0.4} far={10} color="#082f49" />

                <OrbitControls
                    enablePan={false}
                    minDistance={2}
                    maxDistance={12}
                    autoRotate={false} // rotation handled in useFrame for idle only
                    enableDamping
                    dampingFactor={0.08}
                />
            </Canvas>

            {/* ── Hover tooltip ─────────────────────────────────────────── */}
            {hoveredOrgan && hoveredEffect && (() => {
                const { text, hex } = heatLabelColor(hoveredEffect.intensity);
                return (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none
                        bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl px-5 py-3.5
                        shadow-2xl min-w-[210px] text-center">
                        <p className="text-base font-black text-white flex items-center justify-center gap-2">
                            <span>{ORGAN_ICONS[hoveredOrgan] ?? '🫀'}</span> {hoveredOrgan}
                        </p>
                        <p className="text-xs text-blue-200/70 mt-0.5">{hoveredEffect.effect}</p>
                        <div className="mt-2.5 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${hoveredEffect.intensity * 100}%`,
                                    background: `linear-gradient(to right, #facc15, ${hex})`
                                }} />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-white/40">Intensity</span>
                            <span className="text-xs font-bold" style={{ color: hex }}>
                                {text} · {(hoveredEffect.intensity * 100).toFixed(0)}%
                            </span>
                        </div>
                        {hoveredEffect.onset && (
                            <p className="text-[10px] text-white/30 mt-1">
                                ⏱ {hoveredEffect.onset}
                                {hoveredEffect.duration && ` · ⌛ ${hoveredEffect.duration}`}
                            </p>
                        )}
                    </div>
                );
            })()}

            {/* ── Bottom controls ───────────────────────────────────────── */}
            {effects.length > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                    <button
                        onClick={() => onOrganSelect('')}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold border border-white/15
                            bg-black/40 text-white/50 hover:text-white hover:border-white/35 transition-all backdrop-blur-sm">
                        ↺ Reset View
                    </button>
                </div>
            )}

            {/* ── Scan animation while analyzing ───────────────────────── */}
            {isAnalyzing && (
                <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px]
                        bg-gradient-to-r from-transparent via-rose-400 to-transparent
                        shadow-[0_0_24px_#f43f5e] animate-scan" />
                    <div className="absolute inset-0 bg-rose-500/5 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/75 backdrop-blur-md rounded-2xl px-6 py-4
                            border border-rose-500/30 flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" />
                            <span className="text-rose-300 font-bold text-sm">Analyzing Pharmacology...</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Idle hint ─────────────────────────────────────────────── */}
            {effects.length === 0 && !isAnalyzing && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                    <p className="text-white/15 text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse">
                        Select a drug · run analysis
                    </p>
                </div>
            )}

            <style>{`
                @keyframes scan { 0%{top:0} 100%{top:100%} }
                .animate-scan { animation: scan 2.2s linear infinite; }
            `}</style>
        </div>
    );
};

export default DrugHeatmap3D;
