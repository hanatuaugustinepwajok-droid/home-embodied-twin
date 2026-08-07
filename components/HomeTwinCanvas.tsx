/**
 * HomeTwinCanvas — Counterfactual Shadow Twin 3D 视图
 * 职责：只读 store，按 displayMode 渲染 MAIN_ONLY / OVERLAY / SPLIT_SCREEN。
 * 不启动仿真 tick。
 */

'use client';

import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CounterfactualHud } from '@/components/CounterfactualHud';
import { ROOM_NAME_BY_ID } from '@/lib/roomFocus';
import { useHomeStore } from '@/store/useHomeStore';
import type { ShadowSnapshot } from '@/types/counterfactual';
import type {
  HomeSnapshot,
  NavStatus,
  ObjectNode,
  PersonNode,
  RoomId,
  RoomNode,
  Vec3,
} from '@/types/home';

// ---------------------------------------------------------------------------
// 视觉常量
// ---------------------------------------------------------------------------

const ROOM_COLORS: Record<RoomId, string> = {
  living_room: '#1e3a5f',
  bedroom: '#3b2f5c',
  kitchen: '#1f3d36',
  corridor: '#334155',
};

const ROOM_COLORS_GRAY: Record<RoomId, string> = {
  living_room: '#2a2a2e',
  bedroom: '#323236',
  kitchen: '#2e2e32',
  corridor: '#3a3a40',
};

const ROOM_EDGE: Record<RoomId, string> = {
  living_room: '#38bdf8',
  bedroom: '#a78bfa',
  kitchen: '#34d399',
  corridor: '#94a3b8',
};

function navColor(status: NavStatus): string {
  switch (status) {
    case 'avoiding':
      return '#fbbf24';
    case 'stuck':
      return '#ef4444';
    case 'replanning':
      return '#f97316';
    case 'recovered':
      return '#34d399';
    case 'idle':
    case 'navigating':
    default:
      return '#22d3ee';
  }
}

function isStressNav(status: NavStatus): boolean {
  return (
    status === 'avoiding' ||
    status === 'stuck' ||
    status === 'replanning'
  );
}

function toPoints(path: Vec3[], y = 0.06): [number, number, number][] {
  return path.map((p) => [p.x, y, p.z]);
}

const HOUSE_CENTER: [number, number, number] = [5, 0, 4];

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function RoomFloor({
  room,
  grayscale = false,
  focused = false,
}: {
  room: RoomNode;
  grayscale?: boolean;
  focused?: boolean;
}) {
  const { min, max } = room.bounds;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const floorColor = grayscale
    ? ROOM_COLORS_GRAY[room.id]
    : ROOM_COLORS[room.id];
  const edgeColor = focused
    ? '#67e8f9'
    : grayscale
      ? '#6b7280'
      : ROOM_EDGE[room.id];

  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={floorColor}
          roughness={0.85}
          metalness={0.05}
          emissive={focused ? '#22d3ee' : '#000000'}
          emissiveIntensity={focused ? 0.55 : 0}
        />
      </mesh>
      <Line
        points={[
          [-w / 2, 0.02, -d / 2],
          [w / 2, 0.02, -d / 2],
          [w / 2, 0.02, d / 2],
          [-w / 2, 0.02, d / 2],
          [-w / 2, 0.02, -d / 2],
        ]}
        color={edgeColor}
        lineWidth={focused ? 2.2 : 1.2}
        transparent
        opacity={focused ? 0.95 : grayscale ? 0.35 : 0.55}
      />
      {!grayscale && (
        <Html
          position={[0, 0.05, 0]}
          center
          distanceFactor={18}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] backdrop-blur-sm ${
              focused
                ? 'bg-cyan-500/30 text-cyan-100'
                : 'bg-zinc-950/70 text-zinc-300/90'
            }`}
          >
            {room.name}
            {focused ? ' · FOCUS' : ''}
          </div>
        </Html>
      )}
    </group>
  );
}

function ObjectMesh({
  object,
  highlight,
}: {
  object: ObjectNode;
  highlight: boolean;
}) {
  const { position: pos, name } = object;
  const color =
    name === '遥控器'
      ? '#f59e0b'
      : name === '水杯'
        ? '#38bdf8'
        : '#a3e635';

  return (
    <group position={[pos.x, 0, pos.z]}>
      {name === '水杯' ? (
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.35, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={highlight ? color : '#000000'}
            emissiveIntensity={highlight ? 0.45 : 0}
          />
        </mesh>
      ) : name === '充电器' ? (
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[0.18, 0.44, 0.12]} />
          <meshStandardMaterial
            color={color}
            emissive={highlight ? color : '#000000'}
            emissiveIntensity={highlight ? 0.45 : 0}
          />
        </mesh>
      ) : (
        <mesh position={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.28, 0.08, 0.16]} />
          <meshStandardMaterial
            color={color}
            emissive={highlight ? color : '#000000'}
            emissiveIntensity={highlight ? 0.45 : 0}
          />
        </mesh>
      )}
      {highlight && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.28, 0.38, 24]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}

function PersonMesh({
  person,
  rooms,
  highlight,
}: {
  person: PersonNode;
  rooms: RoomNode[];
  highlight: boolean;
}) {
  const faded = person.position === null;
  const fallback =
    rooms.find((r) => r.id === person.roomId)?.center ??
    ({ x: HOUSE_CENTER[0], y: 0, z: HOUSE_CENTER[2] } satisfies Vec3);
  const pos = person.position ?? fallback;

  return (
    <group position={[pos.x, 0, pos.z]} visible>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.7, 14]} />
        <meshStandardMaterial
          color={highlight ? '#22d3ee' : '#94a3b8'}
          transparent={faded}
          opacity={faded ? 0.35 : 1}
          emissive={highlight ? '#22d3ee' : '#000000'}
          emissiveIntensity={highlight ? 0.35 : 0}
        />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color={highlight ? '#e0f2fe' : '#e2e8f0'}
          transparent={faded}
          opacity={faded ? 0.35 : 1}
        />
      </mesh>
      {!faded && (
        <Html
          position={[0, 1.35, 0]}
          center
          distanceFactor={16}
          style={{ pointerEvents: 'none' }}
        >
          <div className="whitespace-nowrap rounded bg-zinc-950/75 px-1 py-0.5 font-mono text-[9px] text-zinc-200">
            {person.name}
          </div>
        </Html>
      )}
      {highlight && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.32, 0.42, 24]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function RobotMesh({
  position,
  yaw,
  navStatus,
  ghost = false,
}: {
  position: Vec3;
  yaw: number;
  navStatus: NavStatus;
  ghost?: boolean;
}) {
  const color = ghost ? '#f87171' : navColor(navStatus);
  const opacity = ghost ? 0.38 : 1;

  return (
    <group position={[position.x, 0, position.z]} rotation={[0, yaw, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.28, 0.4, 32]} />
        <meshBasicMaterial color={color} transparent opacity={ghost ? 0.25 : 0.45} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow={!ghost}>
        <boxGeometry args={[0.42, 0.32, 0.48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={ghost ? 0.12 : 0.35}
          metalness={0.25}
          roughness={0.4}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 0.28, 0.28]}>
        <boxGeometry args={[0.16, 0.1, 0.12]} />
        <meshStandardMaterial
          color={ghost ? '#fecaca' : '#f8fafc'}
          emissive={ghost ? '#ef4444' : '#ffffff'}
          emissiveIntensity={ghost ? 0.1 : 0.2}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

function ObstacleBlock({
  robot,
}: {
  robot: { position: Vec3; yaw: number };
}) {
  const ahead = useMemo(() => {
    const dx = Math.sin(robot.yaw) * 1.1;
    const dz = Math.cos(robot.yaw) * 1.1;
    let x = robot.position.x + dx;
    let z = robot.position.z + dz;
    x = THREE.MathUtils.clamp(x, 0.5, 10);
    z = THREE.MathUtils.clamp(z, 0.5, 8);
    return { x, z };
  }, [robot.position.x, robot.position.z, robot.yaw]);

  return (
    <mesh position={[ahead.x, 0.45, ahead.z]} castShadow>
      <boxGeometry args={[0.7, 0.9, 0.35]} />
      <meshStandardMaterial
        color="#ef4444"
        transparent
        opacity={0.55}
        emissive="#ef4444"
        emissiveIntensity={0.25}
      />
    </mesh>
  );
}

function PathLines({
  pathHistory,
  plannedPath,
  navStatus,
  historyColor = '#22c55e',
  plannedOverride,
  dashedHistory = false,
}: {
  pathHistory: Vec3[];
  plannedPath: Vec3[];
  navStatus: NavStatus;
  historyColor?: string;
  plannedOverride?: string;
  dashedHistory?: boolean;
}) {
  const historyPts = useMemo(
    () => (pathHistory.length >= 2 ? toPoints(pathHistory, 0.05) : null),
    [pathHistory],
  );
  const plannedPts = useMemo(
    () => (plannedPath.length >= 2 ? toPoints(plannedPath, 0.08) : null),
    [plannedPath],
  );
  const plannedColor =
    plannedOverride ?? (isStressNav(navStatus) ? '#ef4444' : '#3b82f6');

  return (
    <group>
      {historyPts && (
        <Line
          points={historyPts}
          color={historyColor}
          lineWidth={dashedHistory ? 1.5 : 2}
          dashed={dashedHistory}
          dashSize={0.18}
          gapSize={0.14}
          transparent
          opacity={dashedHistory ? 0.5 : 0.65}
        />
      )}
      {plannedPts && (
        <Line
          points={plannedPts}
          color={plannedColor}
          lineWidth={2.5}
          dashed
          dashSize={0.22}
          gapSize={0.12}
          transparent
          opacity={0.9}
        />
      )}
    </group>
  );
}

function StaticOccupancyMarks({ points }: { points: Vec3[] }) {
  if (points.length === 0) return null;
  return (
    <group>
      {points.map((p, i) => (
        <mesh key={`occ_${i}`} position={[p.x, 0.08, p.z]}>
          <boxGeometry args={[0.22, 0.16, 0.22]} />
          <meshStandardMaterial
            color="#6b7280"
            transparent
            opacity={0.45}
            wireframe
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig({
  robotPos,
  focusCenter,
}: {
  robotPos: Vec3 | null;
  focusCenter: Vec3 | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = focusCenter ?? robotPos;
    if (!target) return;
    const k = 1 - Math.exp(-1.6 * delta);
    controls.target.x = THREE.MathUtils.lerp(controls.target.x, target.x, k);
    controls.target.z = THREE.MathUtils.lerp(controls.target.z, target.z, k);
    controls.target.y = 0;
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      minDistance={4}
      maxDistance={28}
      maxPolarAngle={Math.PI / 2.15}
      minPolarAngle={0.15}
      target={HOUSE_CENTER}
    />
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#94a3b8', '#020617', 0.35]} />
    </>
  );
}

function TwinScene({
  snapshot,
  shadow,
  mode,
  focusRoomId,
}: {
  snapshot: HomeSnapshot;
  shadow: ShadowSnapshot | null;
  mode: 'main' | 'shadow' | 'overlay';
  focusRoomId: RoomId | null;
}) {
  const grayscale = mode === 'shadow';
  const {
    robot,
    pathHistory,
    plannedPath,
    semanticMap,
    navStatus,
    isObstacleInjected,
    currentTask,
  } = snapshot;

  const targetId = currentTask?.targetId;
  const targetName = currentTask?.targetName;
  const followPos =
    mode === 'shadow' && shadow ? shadow.robot.position : robot.position;
  const focusCenter =
    focusRoomId != null
      ? (semanticMap.rooms.find((r) => r.id === focusRoomId)?.center ?? null)
      : null;

  return (
    <>
      <color attach="background" args={[grayscale ? '#09090b' : '#020617']} />
      <SceneLights />
      <gridHelper
        args={[14, 28, grayscale ? '#27272a' : '#1e293b', '#0f172a']}
        position={[5, 0.001, 4]}
      />

      {semanticMap.rooms.map((room) => (
        <RoomFloor
          key={room.id}
          room={room}
          grayscale={grayscale}
          focused={focusRoomId === room.id}
        />
      ))}

      {!grayscale &&
        semanticMap.objects.map((obj) => (
          <ObjectMesh
            key={obj.id}
            object={obj}
            highlight={
              !!targetId ? obj.id === targetId : targetName === obj.name
            }
          />
        ))}

      {!grayscale &&
        semanticMap.persons.map((person) => (
          <PersonMesh
            key={person.id}
            person={person}
            rooms={semanticMap.rooms}
            highlight={
              !!targetId
                ? person.id === targetId
                : targetName === person.name
            }
          />
        ))}

      {(mode === 'main' || mode === 'overlay') && (
        <>
          <RobotMesh
            position={robot.position}
            yaw={robot.yaw}
            navStatus={navStatus}
          />
          <PathLines
            pathHistory={pathHistory}
            plannedPath={plannedPath}
            navStatus={navStatus}
          />
        </>
      )}

      {(mode === 'shadow' || mode === 'overlay') && shadow && (
        <>
          <RobotMesh
            position={shadow.robot.position}
            yaw={shadow.robot.yaw}
            navStatus={shadow.navStatus}
            ghost={mode === 'overlay'}
          />
          <PathLines
            pathHistory={shadow.pathHistory}
            plannedPath={shadow.plannedPath}
            navStatus={shadow.navStatus}
            historyColor={mode === 'overlay' ? '#f87171' : '#9ca3af'}
            plannedOverride="#a1a1aa"
            dashedHistory
          />
          {mode === 'shadow' && (
            <StaticOccupancyMarks points={shadow.staticOccupancy} />
          )}
        </>
      )}

      {isObstacleInjected && mode !== 'shadow' && (
        <ObstacleBlock robot={robot} />
      )}
      {isObstacleInjected && mode === 'shadow' && shadow && (
        <ObstacleBlock robot={shadow.robot} />
      )}

      <CameraRig robotPos={followPos} focusCenter={focusCenter} />
    </>
  );
}

function ViewportCanvas({
  snapshot,
  shadow,
  mode,
  label,
  focusRoomId,
  emphasized = false,
}: {
  snapshot: HomeSnapshot;
  shadow: ShadowSnapshot | null;
  mode: 'main' | 'shadow' | 'overlay';
  label: string;
  focusRoomId: RoomId | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`relative h-full min-h-0 flex-1 overflow-hidden ${
        emphasized ? 'ring-2 ring-inset ring-rose-500/60' : ''
      } ${mode === 'shadow' ? 'saturate-50 contrast-90' : ''}`}
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{
          position: [0, 12, 10],
          fov: 42,
          near: 0.1,
          far: 80,
        }}
        gl={{ antialias: true, alpha: false }}
      >
        <TwinScene
          snapshot={snapshot}
          shadow={shadow}
          mode={mode}
          focusRoomId={focusRoomId}
        />
      </Canvas>
      <div
        className={`pointer-events-none absolute left-2 top-2 rounded-md border px-2 py-1 font-mono text-[10px] backdrop-blur ${
          emphasized
            ? 'border-rose-500/50 bg-rose-950/80 text-rose-200'
            : 'border-zinc-700/60 bg-zinc-950/70 text-zinc-400'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export function HomeTwinCanvas() {
  const snapshot = useHomeStore((s) => s.snapshot);
  const shadowSnapshot = useHomeStore((s) => s.shadowSnapshot);
  const displayMode = useHomeStore((s) => s.displayMode);
  const ablationEnabled = useHomeStore((s) => s.ablationEnabled);
  const emphasizeNonAi = useHomeStore((s) => s.emphasizeNonAi);
  const focusRoomId = useHomeStore((s) => s.focusRoomId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-xs text-zinc-500">
        初始化 3D 画布…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950 font-mono text-xs text-zinc-500">
        等待仿真数据...
      </div>
    );
  }

  const effectiveMode =
    !ablationEnabled && displayMode !== 'MAIN_ONLY'
      ? 'MAIN_ONLY'
      : displayMode;

  const shadowOutcome = shadowSnapshot?.taskOutcome;
  const shadowFailTag =
    shadowOutcome === 'stalled' || shadowOutcome === 'failed'
      ? ` · ${shadowOutcome.toUpperCase()}`
      : '';

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl bg-slate-950">
      {/* 中区叙事标签 — 更大更一眼 */}
      <div className="pointer-events-none absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2">
        <span className="rounded-lg border border-cyan-400/50 bg-cyan-950/90 px-3 py-1 font-mono text-xs font-bold tracking-wide text-cyan-100 shadow-lg shadow-cyan-900/30">
          AI World · MAIN
        </span>
        <span className="text-xs font-semibold text-zinc-500">vs</span>
        <span
          className={`rounded-lg border px-3 py-1 font-mono text-xs font-bold tracking-wide shadow-lg ${
            emphasizeNonAi
              ? 'border-rose-300/80 bg-rose-700/50 text-rose-50 shadow-rose-900/40'
              : 'border-rose-400/50 bg-rose-950/90 text-rose-100 shadow-rose-900/30'
          }`}
        >
          Non-AI World · SHADOW
        </span>
      </div>

      {focusRoomId && (
        <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-md border border-cyan-500/40 bg-zinc-950/80 px-2 py-1 font-mono text-[10px] text-cyan-200 backdrop-blur">
          focusRoom · {ROOM_NAME_BY_ID[focusRoomId]}
        </div>
      )}

      {effectiveMode === 'SPLIT_SCREEN' ? (
        <div className="flex h-full w-full pt-7">
          <ViewportCanvas
            snapshot={snapshot}
            shadow={shadowSnapshot}
            mode="main"
            focusRoomId={focusRoomId}
            label={`AI World · MAIN · ${snapshot.navStatus}`}
            emphasized={false}
          />
          <div className="w-px shrink-0 bg-zinc-700/80" />
          <ViewportCanvas
            snapshot={snapshot}
            shadow={shadowSnapshot}
            mode="shadow"
            focusRoomId={focusRoomId}
            label={`Non-AI · SHADOW · ${shadowSnapshot?.navStatus ?? 'idle'}${shadowFailTag}`}
            emphasized={emphasizeNonAi}
          />
        </div>
      ) : (
        <div className="h-full w-full pt-7">
          <ViewportCanvas
            snapshot={snapshot}
            shadow={shadowSnapshot}
            mode={effectiveMode === 'OVERLAY' ? 'overlay' : 'main'}
            focusRoomId={focusRoomId}
            emphasized={emphasizeNonAi && effectiveMode === 'OVERLAY'}
            label={
              effectiveMode === 'OVERLAY'
                ? `OVERLAY · AI ${snapshot.navStatus} · Non-AI ${shadowSnapshot?.navStatus ?? '—'}${shadowFailTag}`
                : `AI World · ${snapshot.robot.roomId} · ${snapshot.navStatus}`
            }
          />
        </div>
      )}

      <CounterfactualHud />
    </div>
  );
}
