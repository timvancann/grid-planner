import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// OpenGrid Planner — mm-accurate planning canvas for openGrid layouts
// World space is millimetres. Screen = world * ppm + origin. Grid origin is
// fixed at (0,0); images/surfaces/tools move relative to the grid.
// ---------------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TOOL_COLORS = ["#53c2e8", "#8ab4f8", "#6fd08c", "#c792ea", "#f78c6c"];

const S = {
  bg: "#101318",
  panel: "#171b21",
  panelBorder: "#232a33",
  text: "#d7dde3",
  dim: "#8b95a1",
  accent: "#f2a33c",
  danger: "#e5484d",
  mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace",
};

const inputStyle = {
  background: "#0d1015",
  border: `1px solid ${S.panelBorder}`,
  color: S.text,
  borderRadius: 4,
  padding: "4px 6px",
  fontFamily: S.mono,
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};

const btnStyle = (active) => ({
  background: active ? S.accent : "#1e242c",
  color: active ? "#14161a" : S.text,
  border: `1px solid ${active ? S.accent : S.panelBorder}`,
  borderRadius: 4,
  padding: "5px 10px",
  fontSize: 12,
  fontFamily: S.mono,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

function Section({ title, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${S.panelBorder}`, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: S.dim, marginBottom: 8, fontFamily: S.mono }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: S.dim, width: 70, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>{children}</div>
    </div>
  );
}

export default function OpenGridPlanner() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ ppm: 1.4, ox: 120, oy: 100 });
  const [pitch, setPitch] = useState(28);
  const [mode, setMode] = useState("move"); // move | paint | calibrate
  const [snap, setSnap] = useState(true);

  const [image, setImage] = useState(null); // {href,natW,natH,scale(mm/px),x,y,rot,opacity,locked}
  const [surfaces, setSurfaces] = useState([]); // {id,x,y,w,h}
  const [tools, setTools] = useState([]); // {id,name,w,h,x,y,color}
  const [active, setActive] = useState(() => new Set());
  const [calib, setCalib] = useState(null); // {a,b,dist}

  const [newSurf, setNewSurf] = useState({ w: 600, h: 400 });
  const [newTool, setNewTool] = useState({ name: "Tool", w: 84, h: 56 });

  const dragRef = useRef(null);
  const ptrsRef = useRef(new Map());

  // ---- viewport sizing -----------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (clientX, clientY) => {
      const r = svgRef.current.getBoundingClientRect();
      return {
        x: (clientX - r.left - view.ox) / view.ppm,
        y: (clientY - r.top - view.oy) / view.ppm,
      };
    },
    [view]
  );

  // ---- wheel zoom (non-passive) -------------------------------------------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setView((v) => {
        const wx = (sx - v.ox) / v.ppm;
        const wy = (sy - v.oy) / v.ppm;
        const ppm = clamp(v.ppm * Math.exp(-e.deltaY * 0.0012), 0.05, 30);
        return { ppm, ox: sx - wx * ppm, oy: sy - wy * ppm };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- painting ------------------------------------------------------------
  const cellKeyAt = (w) => `${Math.floor(w.x / pitch)},${Math.floor(w.y / pitch)}`;
  const paintCell = (key, value) => {
    setActive((prev) => {
      const has = prev.has(key);
      if (value === has) return prev;
      const next = new Set(prev);
      value ? next.add(key) : next.delete(key);
      return next;
    });
  };

  // ---- pointer handling ----------------------------------------------------
  const onBgPointerDown = (e) => {
    svgRef.current.setPointerCapture(e.pointerId);
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrsRef.current.size === 2) {
      dragRef.current = null;
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (mode === "calibrate" && image) {
      if (!calib || !calib.a) setCalib({ a: w, b: null, dist: "" });
      else if (!calib.b) setCalib({ ...calib, b: w });
      return;
    }
    if (mode === "paint") {
      const key = cellKeyAt(w);
      const value = !active.has(key);
      dragRef.current = { type: "paint", value, last: key };
      paintCell(key, value);
      return;
    }
    dragRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
  };

  const startObjectDrag = (e, type, obj) => {
    if (mode !== "move") return;
    e.stopPropagation();
    svgRef.current.setPointerCapture(e.pointerId);
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = { type, id: obj.id, start: w, orig: { x: obj.x, y: obj.y } };
  };

  const onPointerMove = (e) => {
    const ptrs = ptrsRef.current;
    if (ptrs.has(e.pointerId)) {
      // pinch zoom with two pointers
      if (ptrs.size === 2) {
        const old = [...ptrs.values()];
        const oldDist = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y);
        const oldMid = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = [...ptrs.values()];
        const newDist = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
        const newMid = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
        const r = svgRef.current.getBoundingClientRect();
        setView((v) => {
          const ppm = clamp(v.ppm * (newDist / (oldDist || newDist)), 0.05, 30);
          const wx = (oldMid.x - r.left - v.ox) / v.ppm;
          const wy = (oldMid.y - r.top - v.oy) / v.ppm;
          return { ppm, ox: newMid.x - r.left - wx * ppm, oy: newMid.y - r.top - wy * ppm };
        });
        return;
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const d = dragRef.current;
    if (!d) return;
    if (d.type === "pan") {
      setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.sx), oy: d.oy + (e.clientY - d.sy) }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.type === "paint") {
      const key = cellKeyAt(w);
      if (key !== d.last) {
        d.last = key;
        paintCell(key, d.value);
      }
      return;
    }
    let nx = d.orig.x + (w.x - d.start.x);
    let ny = d.orig.y + (w.y - d.start.y);
    if (snap && (d.type === "tool" || d.type === "surface")) {
      nx = Math.round(nx / pitch) * pitch;
      ny = Math.round(ny / pitch) * pitch;
    }
    if (d.type === "tool") setTools((ts) => ts.map((t) => (t.id === d.id ? { ...t, x: nx, y: ny } : t)));
    if (d.type === "surface") setSurfaces((ss) => ss.map((s) => (s.id === d.id ? { ...s, x: nx, y: ny } : s)));
    if (d.type === "image") setImage((im) => ({ ...im, x: nx, y: ny }));
  };

  const onPointerUp = (e) => {
    ptrsRef.current.delete(e.pointerId);
    if (ptrsRef.current.size < 2 && dragRef.current === null) return;
    if (ptrsRef.current.size === 0) dragRef.current = null;
  };

  // ---- image upload & calibration -----------------------------------------
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // initial guess: fit image to ~1000mm wide
        const scale = 1000 / img.naturalWidth;
        setImage({
          href: reader.result,
          natW: img.naturalWidth,
          natH: img.naturalHeight,
          scale,
          x: 0,
          y: 0,
          rot: 0,
          opacity: 0.85,
          locked: false,
        });
        setMode("calibrate");
        setCalib(null);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const applyCalibration = () => {
    const D = parseFloat(calib?.dist);
    if (!image || !calib?.a || !calib?.b || !(D > 0)) return;
    const { a, b } = calib;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-6) return;
    const r = D / d;
    const s2 = image.scale * r;
    // keep clicked point A fixed in world space (valid under rotation-about-center)
    const C = {
      x: image.x + (image.natW * image.scale) / 2,
      y: image.y + (image.natH * image.scale) / 2,
    };
    const C2 = { x: a.x - r * (a.x - C.x), y: a.y - r * (a.y - C.y) };
    setImage({
      ...image,
      scale: s2,
      x: C2.x - (image.natW * s2) / 2,
      y: C2.y - (image.natH * s2) / 2,
    });
    setCalib(null);
    setMode("move");
  };

  // ---- derived geometry ----------------------------------------------------
  const vb = useMemo(
    () => ({
      x0: -view.ox / view.ppm,
      y0: -view.oy / view.ppm,
      x1: (size.w - view.ox) / view.ppm,
      y1: (size.h - view.oy) / view.ppm,
    }),
    [view, size]
  );

  const gridLines = useMemo(() => {
    const px = pitch * view.ppm;
    const step = px < 6 ? 5 : 1; // decimate when zoomed far out
    const s = pitch * step;
    const i0 = Math.floor(vb.x0 / s), i1 = Math.ceil(vb.x1 / s);
    const j0 = Math.floor(vb.y0 / s), j1 = Math.ceil(vb.y1 / s);
    if (i1 - i0 > 600 || j1 - j0 > 600) return { v: [], h: [], step };
    const v = [], h = [];
    for (let i = i0; i <= i1; i++) v.push(i * s);
    for (let j = j0; j <= j1; j++) h.push(j * s);
    return { v, h, step };
  }, [vb, pitch, view.ppm]);

  const toolCells = useMemo(() => {
    const eps = 0.5;
    return tools.map((t) => {
      const i0 = Math.floor((t.x + eps) / pitch);
      const i1 = Math.floor((t.x + t.w - eps) / pitch);
      const j0 = Math.floor((t.y + eps) / pitch);
      const j1 = Math.floor((t.y + t.h - eps) / pitch);
      const cells = [];
      let conflict = false;
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const ok = active.has(`${i},${j}`);
          if (!ok) conflict = true;
          cells.push({ i, j, ok });
        }
      return { tool: t, cells, conflict };
    });
  }, [tools, pitch, active]);

  const activeArr = useMemo(() => [...active].map((k) => k.split(",").map(Number)), [active]);

  // ---- export / import -----------------------------------------------------
  const exportPlan = () => {
    const data = JSON.stringify({ pitch, image, surfaces, tools, active: [...active] });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "opengrid-plan.json";
    a.click();
  };
  const importPlan = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (d.pitch) setPitch(d.pitch);
        setImage(d.image ?? null);
        setSurfaces(d.surfaces ?? []);
        setTools(d.tools ?? []);
        setActive(new Set(d.active ?? []));
      } catch {
        /* invalid file — leave state untouched */
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  const fontMm = 11 / view.ppm;
  const objectsInteractive = mode === "move";
  const dimming = active.size > 0;

  // ---- render --------------------------------------------------------------
  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", background: S.bg, color: S.text, fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 250, flexShrink: 0, background: S.panel, borderRight: `1px solid ${S.panelBorder}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 12px 8px", fontFamily: S.mono, fontSize: 14, letterSpacing: 0.5 }}>
          <span style={{ color: S.accent }}>▦</span> opengrid planner
        </div>

        <Section title="Grid">
          <Row label="pitch (mm)">
            <input type="number" style={inputStyle} value={pitch} min={1} step={0.5}
              onChange={(e) => setPitch(Math.max(1, parseFloat(e.target.value) || 28))} />
          </Row>
          <Row label="snap">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            <span style={{ fontSize: 11, color: S.dim }}>tools & surfaces to pitch</span>
          </Row>
        </Section>

        <Section title="Background image">
          {!image ? (
            <button style={btnStyle(false)} onClick={() => fileRef.current.click()}>Upload image…</button>
          ) : (
            <>
              <Row label="scale">
                <input type="number" style={inputStyle} value={+image.scale.toFixed(4)} step={0.001}
                  onChange={(e) => setImage({ ...image, scale: Math.max(1e-4, parseFloat(e.target.value) || image.scale) })} />
                <span style={{ fontSize: 10, color: S.dim }}>mm/px</span>
              </Row>
              <Row label="rotation">
                <input type="number" style={{ ...inputStyle, width: 64 }} value={image.rot} step={0.1}
                  onChange={(e) => setImage({ ...image, rot: parseFloat(e.target.value) || 0 })} />
                <span style={{ fontSize: 10, color: S.dim }}>°</span>
              </Row>
              <input type="range" min={-180} max={180} step={0.1} value={image.rot} style={{ width: "100%" }}
                onChange={(e) => setImage({ ...image, rot: parseFloat(e.target.value) })} />
              <Row label="opacity">
                <input type="range" min={0.1} max={1} step={0.05} value={image.opacity} style={{ width: "100%" }}
                  onChange={(e) => setImage({ ...image, opacity: parseFloat(e.target.value) })} />
              </Row>
              <Row label="size">
                <span style={{ fontFamily: S.mono, fontSize: 11 }}>
                  {(image.natW * image.scale).toFixed(0)} × {(image.natH * image.scale).toFixed(0)} mm
                </span>
              </Row>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button style={btnStyle(mode === "calibrate")} onClick={() => { setMode("calibrate"); setCalib(null); }}>
                  Calibrate
                </button>
                <button style={btnStyle(image.locked)} onClick={() => setImage({ ...image, locked: !image.locked })}>
                  {image.locked ? "Locked" : "Lock"}
                </button>
                <button style={btnStyle(false)} onClick={() => { setImage(null); setCalib(null); }}>Remove</button>
              </div>
              {mode === "calibrate" && (
                <div style={{ marginTop: 8, padding: 8, background: "#0d1015", borderRadius: 4, border: `1px solid ${S.panelBorder}` }}>
                  {!calib?.a && <div style={{ fontSize: 11, color: S.accent }}>Click first reference point on the canvas.</div>}
                  {calib?.a && !calib?.b && <div style={{ fontSize: 11, color: S.accent }}>Click second reference point.</div>}
                  {calib?.a && calib?.b && (
                    <>
                      <div style={{ fontSize: 11, color: S.dim, marginBottom: 6 }}>Real distance between points:</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" style={inputStyle} placeholder="mm" autoFocus value={calib.dist}
                          onChange={(e) => setCalib({ ...calib, dist: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && applyCalibration()} />
                        <button style={btnStyle(true)} onClick={applyCalibration}>Set</button>
                      </div>
                    </>
                  )}
                  <button style={{ ...btnStyle(false), marginTop: 6 }} onClick={() => { setCalib(null); setMode("move"); }}>Cancel</button>
                </div>
              )}
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        </Section>

        <Section title="Surfaces">
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="number" style={inputStyle} value={newSurf.w} onChange={(e) => setNewSurf({ ...newSurf, w: parseFloat(e.target.value) || 0 })} />
            <span style={{ color: S.dim }}>×</span>
            <input type="number" style={inputStyle} value={newSurf.h} onChange={(e) => setNewSurf({ ...newSurf, h: parseFloat(e.target.value) || 0 })} />
            <button style={btnStyle(false)} onClick={() => {
              if (newSurf.w > 0 && newSurf.h > 0) {
                const c = { x: (vb.x0 + vb.x1) / 2, y: (vb.y0 + vb.y1) / 2 };
                let x = c.x - newSurf.w / 2, y = c.y - newSurf.h / 2;
                if (snap) { x = Math.round(x / pitch) * pitch; y = Math.round(y / pitch) * pitch; }
                setSurfaces([...surfaces, { id: uid(), x, y, w: newSurf.w, h: newSurf.h }]);
              }
            }}>Add</button>
          </div>
          {surfaces.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontFamily: S.mono, marginBottom: 4 }}>
              <span>{s.w} × {s.h} mm</span>
              <button style={{ ...btnStyle(false), padding: "1px 6px" }} onClick={() => setSurfaces(surfaces.filter((x) => x.id !== s.id))}>×</button>
            </div>
          ))}
        </Section>

        <Section title="Tools">
          <input type="text" style={{ ...inputStyle, marginBottom: 6 }} value={newTool.name}
            onChange={(e) => setNewTool({ ...newTool, name: e.target.value })} placeholder="name" />
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="number" style={inputStyle} value={newTool.w} onChange={(e) => setNewTool({ ...newTool, w: parseFloat(e.target.value) || 0 })} />
            <span style={{ color: S.dim }}>×</span>
            <input type="number" style={inputStyle} value={newTool.h} onChange={(e) => setNewTool({ ...newTool, h: parseFloat(e.target.value) || 0 })} />
            <button style={btnStyle(false)} onClick={() => {
              if (newTool.w > 0 && newTool.h > 0) {
                const c = { x: (vb.x0 + vb.x1) / 2, y: (vb.y0 + vb.y1) / 2 };
                let x = c.x - newTool.w / 2, y = c.y - newTool.h / 2;
                if (snap) { x = Math.round(x / pitch) * pitch; y = Math.round(y / pitch) * pitch; }
                setTools([...tools, { id: uid(), name: newTool.name || "Tool", w: newTool.w, h: newTool.h, x, y, color: TOOL_COLORS[tools.length % TOOL_COLORS.length] }]);
              }
            }}>Add</button>
          </div>
          {tools.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontFamily: S.mono, marginBottom: 4 }}>
              <span><span style={{ color: t.color }}>▪</span> {t.name} {t.w}×{t.h}</span>
              <button style={{ ...btnStyle(false), padding: "1px 6px" }} onClick={() => setTools(tools.filter((x) => x.id !== t.id))}>×</button>
            </div>
          ))}
        </Section>

        <Section title="Stats">
          <div style={{ fontFamily: S.mono, fontSize: 11, lineHeight: 1.8 }}>
            <div>active cells: <span style={{ color: S.accent }}>{active.size}</span></div>
            <div>grid area: {((active.size * pitch * pitch) / 1e6).toFixed(3)} m²</div>
            <div>occupied: {new Set(toolCells.flatMap((tc) => tc.cells.filter((c) => c.ok).map((c) => `${c.i},${c.j}`))).size} cells</div>
            {toolCells.some((tc) => tc.conflict) && (
              <div style={{ color: S.danger }}>⚠ tool over inactive cell</div>
            )}
          </div>
        </Section>

        <Section title="Plan">
          <div style={{ display: "flex", gap: 6 }}>
            <button style={btnStyle(false)} onClick={exportPlan}>Export</button>
            <button style={btnStyle(false)} onClick={() => importRef.current.click()}>Import</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importPlan} />
          </div>
        </Section>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} style={{ flex: 1, position: "relative", minWidth: 0 }}>
        {/* mode toolbar */}
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5, display: "flex", gap: 6 }}>
          <button style={btnStyle(mode === "move")} onClick={() => setMode("move")}>Move</button>
          <button style={btnStyle(mode === "paint")} onClick={() => setMode("paint")}>Paint cells</button>
        </div>
        <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 5, fontFamily: S.mono, fontSize: 10, color: S.dim, background: "rgba(16,19,24,.8)", padding: "3px 8px", borderRadius: 4 }}>
          {view.ppm.toFixed(2)} px/mm · pitch {pitch} mm
          {!dimming && " · paint cells to define the printed area"}
        </div>

        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          style={{ display: "block", touchAction: "none", cursor: mode === "paint" ? "crosshair" : mode === "calibrate" ? "crosshair" : "grab", background: S.bg }}
          onPointerDown={onBgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform={`translate(${view.ox},${view.oy}) scale(${view.ppm})`}>
            {/* surfaces */}
            {surfaces.map((s) => (
              <g key={s.id} style={{ pointerEvents: objectsInteractive ? "auto" : "none", cursor: "move" }}
                onPointerDown={(e) => startObjectDrag(e, "surface", s)}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#2b333d" stroke="#4a5666" strokeWidth={1 / view.ppm} />
                <text x={s.x + 4 / view.ppm} y={s.y + fontMm * 1.2} fontSize={fontMm} fill={S.dim} fontFamily={S.mono}>
                  {s.w}×{s.h}
                </text>
              </g>
            ))}

            {/* background image */}
            {image && (
              <image
                href={image.href}
                x={image.x}
                y={image.y}
                width={image.natW * image.scale}
                height={image.natH * image.scale}
                opacity={image.opacity}
                preserveAspectRatio="none"
                transform={`rotate(${image.rot} ${image.x + (image.natW * image.scale) / 2} ${image.y + (image.natH * image.scale) / 2})`}
                style={{ pointerEvents: objectsInteractive && !image.locked ? "auto" : "none", cursor: "move" }}
                onPointerDown={(e) => startObjectDrag(e, "image", image)}
              />
            )}

            {/* dim overlay with active-cell holes */}
            {dimming && (
              <>
                <mask id="activeMask" maskUnits="userSpaceOnUse" x={vb.x0} y={vb.y0} width={vb.x1 - vb.x0} height={vb.y1 - vb.y0}>
                  <rect x={vb.x0} y={vb.y0} width={vb.x1 - vb.x0} height={vb.y1 - vb.y0} fill="white" />
                  {activeArr.map(([i, j]) => (
                    <rect key={`${i},${j}`} x={i * pitch} y={j * pitch} width={pitch} height={pitch} fill="black" />
                  ))}
                </mask>
                <rect x={vb.x0} y={vb.y0} width={vb.x1 - vb.x0} height={vb.y1 - vb.y0}
                  fill="#05080c" opacity={0.72} mask="url(#activeMask)" style={{ pointerEvents: "none" }} />
                {activeArr.map(([i, j]) => (
                  <rect key={`b${i},${j}`} x={i * pitch} y={j * pitch} width={pitch} height={pitch}
                    fill="none" stroke={S.accent} strokeOpacity={0.35} strokeWidth={1 / view.ppm} style={{ pointerEvents: "none" }} />
                ))}
              </>
            )}

            {/* grid lines */}
            <g style={{ pointerEvents: "none" }}>
              {gridLines.v.map((x) => (
                <line key={`v${x}`} x1={x} y1={vb.y0} x2={x} y2={vb.y1}
                  stroke={x === 0 ? S.accent : "#e6edf3"} strokeOpacity={x === 0 ? 0.5 : gridLines.step > 1 ? 0.1 : 0.09}
                  strokeWidth={1 / view.ppm} />
              ))}
              {gridLines.h.map((y) => (
                <line key={`h${y}`} x1={vb.x0} y1={y} x2={vb.x1} y2={y}
                  stroke={y === 0 ? S.accent : "#e6edf3"} strokeOpacity={y === 0 ? 0.5 : gridLines.step > 1 ? 0.1 : 0.09}
                  strokeWidth={1 / view.ppm} />
              ))}
            </g>

            {/* occupied-cell highlights */}
            {toolCells.map(({ tool, cells }) =>
              cells.map((c) => (
                <rect key={`${tool.id}-${c.i}-${c.j}`} x={c.i * pitch} y={c.j * pitch} width={pitch} height={pitch}
                  fill={c.ok ? S.accent : S.danger} opacity={c.ok ? 0.18 : 0.3} style={{ pointerEvents: "none" }} />
              ))
            )}

            {/* tools */}
            {toolCells.map(({ tool: t, conflict }) => (
              <g key={t.id} style={{ pointerEvents: objectsInteractive ? "auto" : "none", cursor: "move" }}
                onPointerDown={(e) => startObjectDrag(e, "tool", t)}>
                <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={2 / view.ppm}
                  fill={t.color} fillOpacity={0.25}
                  stroke={conflict ? S.danger : t.color} strokeWidth={1.5 / view.ppm} />
                <text x={t.x + t.w / 2} y={t.y + t.h / 2} fontSize={fontMm} fill="#fff" fontFamily={S.mono}
                  textAnchor="middle" dominantBaseline="middle">
                  {t.name}
                </text>
              </g>
            ))}

            {/* calibration markers — CAD-style dimension line */}
            {calib?.a && (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={calib.a.x} cy={calib.a.y} r={4 / view.ppm} fill="none" stroke={S.accent} strokeWidth={1.5 / view.ppm} />
                <line x1={calib.a.x - 7 / view.ppm} y1={calib.a.y} x2={calib.a.x + 7 / view.ppm} y2={calib.a.y} stroke={S.accent} strokeWidth={1 / view.ppm} />
                <line x1={calib.a.x} y1={calib.a.y - 7 / view.ppm} x2={calib.a.x} y2={calib.a.y + 7 / view.ppm} stroke={S.accent} strokeWidth={1 / view.ppm} />
                {calib.b && (
                  <>
                    <line x1={calib.a.x} y1={calib.a.y} x2={calib.b.x} y2={calib.b.y} stroke={S.accent} strokeWidth={1 / view.ppm} strokeDasharray={`${4 / view.ppm} ${3 / view.ppm}`} />
                    <circle cx={calib.b.x} cy={calib.b.y} r={4 / view.ppm} fill="none" stroke={S.accent} strokeWidth={1.5 / view.ppm} />
                    <text x={(calib.a.x + calib.b.x) / 2} y={(calib.a.y + calib.b.y) / 2 - 8 / view.ppm}
                      fontSize={fontMm} fill={S.accent} fontFamily={S.mono} textAnchor="middle">
                      {Math.hypot(calib.b.x - calib.a.x, calib.b.y - calib.a.y).toFixed(1)} mm (current)
                    </text>
                  </>
                )}
              </g>
            )}
          </g>

          {/* empty-state hint */}
          {!image && surfaces.length === 0 && (
            <text x={size.w / 2} y={size.h / 2} textAnchor="middle" fill={S.dim} fontSize={13} fontFamily={S.mono}>
              Upload a photo of your surface, or add a surface by its dimensions.
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
