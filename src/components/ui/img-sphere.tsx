"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

/**
 * SphereImageGrid - Interactive 3D Image Sphere Component (provided component, adapted for Pressure Lab)
 *
 * Images arranged on a 3D sphere (Fibonacci distribution), drag-to-rotate with momentum, auto-rotation,
 * depth scaling, overlap prevention, touch support.
 *
 * Pressure Lab changes:
 *  - positions are deterministic (index-seeded offsets instead of Math.random: stable layout, no hydration mismatch)
 *  - onSelect / onHover props; with onSelect the built-in modal is not used
 *  - hoverScale is used (was hard-coded 1.2); top-10 items get a ring + "#n" badge
 *  - auto-rotate pauses on hover and on a hidden tab; prefers-reduced-motion = no auto-rotate, no momentum
 *  - size follows the parent width (ResizeObserver): min(parent width, containerSize)
 *  - items are focusable buttons with aria-labels; Enter selects; a drag never counts as a click
 */

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SphericalPosition {
  theta: number; // Azimuth angle in degrees
  phi: number; // Polar angle in degrees
  radius: number; // Distance from center
}

export interface WorldPosition extends Position3D {
  scale: number;
  zIndex: number;
  isVisible: boolean;
  fadeOpacity: number;
  originalIndex: number;
}

export interface ImageData {
  id: string;
  src: string;
  alt: string;
  title?: string;
  description?: string;
  rank?: number;
  rating?: number;
  team?: string;
  ringColor?: string;
  href?: string;
}

export interface SphereImageGridProps {
  images?: ImageData[];
  containerSize?: number;
  sphereRadius?: number;
  dragSensitivity?: number;
  momentumDecay?: number;
  maxRotationSpeed?: number;
  baseImageScale?: number;
  hoverScale?: number;
  perspective?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  className?: string;
  onSelect?: (item: ImageData) => void;
  onHover?: (item: ImageData | null) => void;
  /** The globe turns toward the cursor while it moves over it. */
  followMouse?: boolean;
  /** Number of tiny dust particles drawn on the sphere shell. */
  dustCount?: number;
}

interface RotationState {
  x: number;
  y: number;
  z: number;
}

interface VelocityState {
  x: number;
  y: number;
}

interface MousePosition {
  x: number;
  y: number;
}

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const SPHERE_MATH = {
  degreesToRadians: (degrees: number): number => degrees * (Math.PI / 180),
  radiansToDegrees: (radians: number): number => radians * (180 / Math.PI),
  normalizeAngle: (angle: number): number => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  },
};

/** Deterministic pseudo-random in [0, 1) seeded by an index (replaces Math.random). */
function seeded(i: number, salt: number) {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ==========================================
// MAIN COMPONENT
// ==========================================

const SphereImageGrid: React.FC<SphereImageGridProps> = ({
  images = [],
  containerSize = 400,
  sphereRadius = 200,
  dragSensitivity = 0.5,
  momentumDecay = 0.95,
  maxRotationSpeed = 5,
  baseImageScale = 0.12,
  hoverScale = 1.2,
  perspective = 1000,
  autoRotate = false,
  autoRotateSpeed = 0.3,
  className = "",
  onSelect,
  onHover,
  followMouse = false,
  dustCount = 0,
}) => {
  // ==========================================
  // STATE & REFS
  // ==========================================

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [rotation, setRotation] = useState<RotationState>({ x: 15, y: 15, z: 0 });
  const [velocity, setVelocity] = useState<VelocityState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [imagePositions, setImagePositions] = useState<SphericalPosition[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [size, setSize] = useState(containerSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<MousePosition>({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);
  const moved = useRef(0);
  const mouse = useRef({ x: 0, y: 0, on: false }); // cursor offset from the centre, -1..1

  // ==========================================
  // COMPUTED VALUES (scaled to the measured size)
  // ==========================================

  const k = size / containerSize;
  const actualSphereRadius = (sphereRadius || containerSize * 0.5) * k;
  const baseImageSize = size * baseImageScale;

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  const generateSpherePositions = useCallback((): SphericalPosition[] => {
    const positions: SphericalPosition[] = [];
    const imageCount = images.length;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = (2 * Math.PI) / goldenRatio;

    for (let i = 0; i < imageCount; i++) {
      const t = i / imageCount;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = angleIncrement * i;

      let phi = inclination * (180 / Math.PI);
      let theta = (azimuth * (180 / Math.PI)) % 360;

      const poleBonus = Math.pow(Math.abs(phi - 90) / 90, 0.6) * 35;
      if (phi < 90) phi = Math.max(5, phi - poleBonus);
      else phi = Math.min(175, phi + poleBonus);

      phi = 15 + (phi / 180) * 150;

      // slight, deterministic offsets to prevent perfect patterns
      theta = (theta + (seeded(i, 1) - 0.5) * 20) % 360;
      phi = Math.max(0, Math.min(180, phi + (seeded(i, 2) - 0.5) * 10));

      positions.push({ theta, phi, radius: 1 }); // unit radius; scaled at render time
    }
    // items come in rank order: hand the equator band to the first (best) items, poles to the last
    return [...positions].sort((a, b) => Math.abs(a.phi - 90) - Math.abs(b.phi - 90));
  }, [images.length]);

  const calculateWorldPositions = useCallback((): WorldPosition[] => {
    const R = actualSphereRadius;
    const positions = imagePositions.map((pos, index) => {
      const thetaRad = SPHERE_MATH.degreesToRadians(pos.theta);
      const phiRad = SPHERE_MATH.degreesToRadians(pos.phi);
      const rotXRad = SPHERE_MATH.degreesToRadians(rotation.x);
      const rotYRad = SPHERE_MATH.degreesToRadians(rotation.y);

      let x = R * Math.sin(phiRad) * Math.cos(thetaRad);
      let y = R * Math.cos(phiRad);
      let z = R * Math.sin(phiRad) * Math.sin(thetaRad);

      const x1 = x * Math.cos(rotYRad) + z * Math.sin(rotYRad);
      const z1 = -x * Math.sin(rotYRad) + z * Math.cos(rotYRad);
      x = x1;
      z = z1;

      const y2 = y * Math.cos(rotXRad) - z * Math.sin(rotXRad);
      const z2 = y * Math.sin(rotXRad) + z * Math.cos(rotXRad);
      y = y2;
      z = z2;

      const fadeZoneStart = -10 * k;
      const fadeZoneEnd = -30 * k;
      const isVisible = z > fadeZoneEnd;
      let fadeOpacity = 1;
      if (z <= fadeZoneStart) fadeOpacity = Math.max(0, (z - fadeZoneEnd) / (fadeZoneStart - fadeZoneEnd));

      const isPoleImage = pos.phi < 30 || pos.phi > 150;
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      const distanceRatio = Math.min(distanceFromCenter / R, 1);
      const distancePenalty = isPoleImage ? 0.4 : 0.7;
      const centerScale = Math.max(0.5, 1 - distanceRatio * distancePenalty * 0.7);
      const depthScale = (z + R) / (2 * R);
      const scale = centerScale * Math.max(0.5, 0.8 + depthScale * 0.3);

      return { x, y, z, scale, zIndex: Math.round(1000 + z), isVisible, fadeOpacity, originalIndex: index };
    });

    // collision detection to prevent overlaps
    const adjusted = [...positions];
    for (let i = 0; i < adjusted.length; i++) {
      const pos = adjusted[i];
      if (!pos.isVisible) continue;
      let adjustedScale = pos.scale;
      const imageSize = baseImageSize * adjustedScale;
      for (let j = 0; j < adjusted.length; j++) {
        if (i === j) continue;
        const other = adjusted[j];
        if (!other.isVisible) continue;
        const otherSize = baseImageSize * other.scale;
        const dx = pos.x - other.x;
        const dy = pos.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (imageSize + otherSize) / 2 + 25 * k;
        if (distance < minDistance && distance > 0) {
          const overlap = minDistance - distance;
          const reductionFactor = Math.max(0.6, 1 - (overlap / minDistance) * 0.45);
          adjustedScale = Math.min(adjustedScale, adjustedScale * reductionFactor);
        }
      }
      adjusted[i] = { ...pos, scale: Math.max(0.42, Math.min(1.05, adjustedScale)) };
    }
    return adjusted;
  }, [imagePositions, rotation, actualSphereRadius, baseImageSize, k]);

  const clampRotationSpeed = useCallback(
    (speed: number): number => Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, speed)),
    [maxRotationSpeed],
  );

  // ==========================================
  // PHYSICS & MOMENTUM
  // ==========================================

  const spinning = autoRotate && !reduced && hoveredIndex === null && !hidden;
  const steering = followMouse && !reduced && mouse.current.on;

  const updateMomentum = useCallback(() => {
    if (isDragging) return;
    const v = reduced ? { x: 0, y: 0 } : velocity;
    if (!spinning && !steering && Math.abs(v.x) < 0.01 && Math.abs(v.y) < 0.01) return; // nothing to animate

    setVelocity((prev) => {
      if (reduced) return { x: 0, y: 0 };
      const nv = { x: prev.x * momentumDecay, y: prev.y * momentumDecay };
      if (Math.abs(nv.x) < 0.01 && Math.abs(nv.y) < 0.01) return { x: 0, y: 0 };
      return nv;
    });
    setRotation((prev) => {
      let newY = prev.y;
      if (spinning) newY += autoRotateSpeed;
      newY += clampRotationSpeed(v.y);
      let newX = prev.x + clampRotationSpeed(v.x);
      if (mouse.current.on && followMouse && !reduced && hoveredIndex === null) {
        newY += mouse.current.x * 1.4; // turn toward the cursor
        newX += (-mouse.current.y * 35 - newX) * 0.04; // tilt to the cursor height
      }
      return {
        x: SPHERE_MATH.normalizeAngle(newX),
        y: SPHERE_MATH.normalizeAngle(newY),
        z: prev.z,
      };
    });
  }, [isDragging, reduced, velocity, spinning, steering, followMouse, hoveredIndex, momentumDecay, autoRotateSpeed, clampRotationSpeed]);

  // ==========================================
  // EVENT HANDLERS (pointer events: mouse + touch)
  // ==========================================

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    setVelocity({ x: 0, y: 0 });
    moved.current = 0;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      moved.current += Math.abs(deltaX) + Math.abs(deltaY);
      const rotationDelta = { x: -deltaY * dragSensitivity, y: deltaX * dragSensitivity };
      setRotation((prev) => ({
        x: SPHERE_MATH.normalizeAngle(prev.x + clampRotationSpeed(rotationDelta.x)),
        y: SPHERE_MATH.normalizeAngle(prev.y + clampRotationSpeed(rotationDelta.y)),
        z: prev.z,
      }));
      setVelocity({ x: clampRotationSpeed(rotationDelta.x), y: clampRotationSpeed(rotationDelta.y) });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [isDragging, dragSensitivity, clampRotationSpeed],
  );

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  const select = (image: ImageData) => {
    if (moved.current > 6) return; // that was a drag, not a click
    if (onSelect) onSelect(image);
    else setSelectedImage(image);
  };

  const hover = (i: number | null) => {
    setHoveredIndex(i);
    onHover?.(i === null ? null : images[i]);
  };

  // ==========================================
  // EFFECTS & LIFECYCLE
  // ==========================================

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    const pos = generateSpherePositions();
    setImagePositions(pos);
    if (pos.length) setRotation({ x: 8, y: SPHERE_MATH.normalizeAngle(pos[0].theta - 90), z: 0 });
  }, [generateSpherePositions]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const up = () => setReduced(mq.matches);
    up();
    mq.addEventListener("change", up);
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => {
      mq.removeEventListener("change", up);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  // responsive: min(parent width, containerSize)
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setSize(Math.max(200, Math.min(containerSize, parent.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [containerSize, isMounted]);

  useEffect(() => {
    const animate = () => {
      updateMomentum();
      animationFrame.current = requestAnimationFrame(animate);
    };
    if (isMounted) animationFrame.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [isMounted, updateMomentum]);

  useEffect(() => {
    if (!isMounted) return;
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isMounted, handlePointerMove, handlePointerUp]);

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  const worldPositions = calculateWorldPositions();

  const renderImageNode = (image: ImageData, index: number) => {
    const position = worldPositions[index];
    if (!position || !position.isVisible) return null;
    const imageSize = baseImageSize * position.scale;
    const isHovered = hoveredIndex === index;
    const finalScale = isHovered ? Math.min(hoverScale, hoverScale / position.scale) : 1;
    const top = image.rank !== undefined && image.rank <= 10;
    const showBadge = top && imageSize * finalScale >= 34;
    const label = `${image.alt}${image.rank !== undefined ? `, rank ${image.rank}` : ""}${image.rating !== undefined ? `, rating ${image.rating.toFixed(1)}` : ""}`;

    return (
      <button
        key={image.id}
        type="button"
        aria-label={label}
        tabIndex={position.fadeOpacity > 0.5 ? 0 : -1}
        className="absolute cursor-pointer select-none rounded-full outline-none transition-transform duration-200 ease-out focus-visible:ring-4 focus-visible:ring-[#3B6FB6]/60"
        style={{
          width: `${imageSize}px`,
          height: `${imageSize}px`,
          left: `${size / 2 + position.x}px`,
          top: `${size / 2 + position.y}px`,
          opacity: position.fadeOpacity,
          transform: `translate(-50%, -50%) scale(${finalScale})`,
          zIndex: isHovered ? 3000 : position.zIndex,
        }}
        onMouseEnter={() => hover(index)}
        onMouseLeave={() => hover(null)}
        onFocus={() => hover(index)}
        onBlur={() => hover(null)}
        onClick={() => select(image)}
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-full border-2 border-white shadow-lg"
          style={top ? { boxShadow: `0 0 0 2px ${image.ringColor ?? "#C2507A"}, 0 8px 18px -8px rgba(60,40,20,0.5)` } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt="" className="h-full w-full object-cover object-top" draggable={false} loading={index < 3 ? "eager" : "lazy"} />
        </div>
        {showBadge && (
          <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-[#2B2118] px-1.5 text-[10px] font-bold leading-[16px] text-white ring-2 ring-white">
            #{image.rank}
          </span>
        )}
      </button>
    );
  };

  const renderSpotlightModal = () => {
    if (!selectedImage) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        onClick={() => setSelectedImage(null)}
        style={{ animation: "fadeIn 0.3s ease-out" }}
      >
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-white" onClick={(e) => e.stopPropagation()} style={{ animation: "scaleIn 0.3s ease-out" }}>
          <div className="relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage.src} alt={selectedImage.alt} className="h-full w-full object-cover" />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-all hover:bg-black/70"
            >
              <X size={16} />
            </button>
          </div>
          {(selectedImage.title || selectedImage.description) && (
            <div className="p-6">
              {selectedImage.title && <h3 className="mb-2 text-xl font-bold">{selectedImage.title}</h3>}
              {selectedImage.description && <p className="text-gray-600">{selectedImage.description}</p>}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // EARLY RETURNS
  // ==========================================

  if (!isMounted) {
    return <div ref={containerRef} className="animate-pulse rounded-full bg-ink/[0.04]" style={{ width: size, height: size }} />;
  }

  if (!images.length) {
    return (
      <div ref={containerRef} className="flex items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 text-[13px] text-text-400" style={{ width: size, height: size }}>
        No players for this filter
      </div>
    );
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>

      <div
        ref={containerRef}
        className={`relative touch-none select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${className}`}
        style={{ width: size, height: size, perspective: `${perspective}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          mouse.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1, on: true };
        }}
        onPointerLeave={() => (mouse.current = { x: 0, y: 0, on: false })}
        role="group"
        aria-label="Player sphere: drag to spin, click a player"
      >
        <div className="relative h-full w-full" style={{ zIndex: 10 }}>
          {dustCount > 0 &&
            Array.from({ length: dustCount }, (_, i) => {
              // dust shell: deterministic Fibonacci points, rotated with the globe
              const t = (i + 0.5) / dustCount;
              const ph = Math.acos(1 - 2 * t);
              const th = Math.PI * (1 + Math.sqrt(5)) * i;
              const R = actualSphereRadius * (0.92 + 0.16 * seeded(i, 3));
              let x = R * Math.sin(ph) * Math.cos(th);
              let y = R * Math.cos(ph);
              let z = R * Math.sin(ph) * Math.sin(th);
              const ry = SPHERE_MATH.degreesToRadians(rotation.y);
              const rx = SPHERE_MATH.degreesToRadians(rotation.x);
              const x1 = x * Math.cos(ry) + z * Math.sin(ry);
              const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
              x = x1;
              const y2 = y * Math.cos(rx) - z1 * Math.sin(rx);
              z = y * Math.sin(rx) + z1 * Math.cos(rx);
              y = y2;
              const depth = (z / R + 1) / 2;
              const d = 1.2 + 2.2 * depth * seeded(i, 4);
              return (
                <span
                  key={`d${i}`}
                  aria-hidden
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    width: d,
                    height: d,
                    left: size / 2 + x,
                    top: size / 2 + y,
                    background: i % 3 ? "#B23A62" : "#3B6FB6",
                    opacity: 0.12 + 0.55 * depth,
                    transform: "translate(-50%, -50%)",
                    zIndex: Math.round(1000 + z) - 1,
                  }}
                />
              );
            })}
          {images.map((image, index) => renderImageNode(image, index))}
        </div>
      </div>

      {!onSelect && renderSpotlightModal()}
    </>
  );
};

export { SphereImageGrid };
export default SphereImageGrid;
