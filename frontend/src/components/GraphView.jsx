import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { fetchGraphData } from "../api";

const NODE_COLORS = {
  github: "#4f8cff",
  confluence: "#a78bfa",
  jira: "#ffb347",
  repo: "#00e5c0",
  org: "#00e5c0",
  team: "#22d3a0",
};

// Cap displayed nodes/edges to keep the simulation snappy
const MAX_NODES = 600;
const MAX_EDGES = 2500;

function nodeColor(n) {
  return NODE_COLORS[n.type] ?? "#64748b";
}
function nodeSize(n) {
  if (n.type === "repo" || n.type === "org") return 8;
  if (n.type === "team") return 7;
  if (n.type === "document") return 4;
  return 5;
}

// Sample a large graph: keep all structural nodes, then fill with docs up to limit
function sampleGraph(rawNodes, rawEdges) {
  const structural = rawNodes.filter((n) =>
    ["org", "repo", "team"].includes(n.type),
  );
  const docs = rawNodes.filter(
    (n) => !["org", "repo", "team"].includes(n.type),
  );
  const kept = [...structural, ...docs.slice(0, MAX_NODES - structural.length)];
  const keptIds = new Set(kept.map((n) => n.id));
  const keptEdges = rawEdges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .slice(0, MAX_EDGES);
  return { nodes: kept, links: keptEdges };
}

export default function GraphView({ shouldFetch }) {
  const [graphData, setGraphData] = useState(null);
  const [rawCounts, setRawCounts] = useState({ nodes: 0, edges: 0 });
  const [FG, setFG] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const hasFetched = useRef(false);

  // Load the force-graph library
  useEffect(() => {
    import("react-force-graph-2d").then((mod) => setFG(() => mod.default));
  }, []);

  // Track container size for responsive canvas.
  // We also read the initial size via rAF so the canvas fills correctly
  // even when the tab was hidden during mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    // Seed immediately in case ResizeObserver fires late
    const raf = requestAnimationFrame(() => {
      if (el.clientWidth > 0)
        setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Fetch graph data once
  useEffect(() => {
    if (!shouldFetch || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetchGraphData()
      .then((data) => {
        const rawNodes = (data.nodes ?? []).map((n) => ({
          ...n,
          color: nodeColor(n),
          val: nodeSize(n),
        }));
        const rawEdges = (data.edges ?? []).map((e) => ({
          source: e.source,
          target: e.target,
          relation: e.relation,
        }));
        setRawCounts({ nodes: rawNodes.length, edges: rawEdges.length });
        setGraphData(sampleGraph(rawNodes, rawEdges));
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Could not load graph data. Run Ingest first to build the knowledge graph.",
        );
        setLoading(false);
      });
  }, [shouldFetch]);

  const handleNodeClick = useCallback((node) => {
    setTooltip({ label: node.label, type: node.type, id: node.id });
  }, []);

  // Auto-fit after simulation cools down
  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40);
  }, []);

  const zoomIn = () => fgRef.current?.zoom(fgRef.current.zoom() * 1.4, 200);
  const zoomOut = () => fgRef.current?.zoom(fgRef.current.zoom() / 1.4, 200);
  const fitView = () => fgRef.current?.zoomToFit(400, 40);

  const isLoading = loading || !FG;
  const isEmpty =
    !isLoading && (error || !graphData || graphData.nodes.length === 0);
  const isSampled = rawCounts.nodes > MAX_NODES;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 w-full bg-bg overflow-hidden"
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg">
          <Loader2 className="text-accent animate-spin" size={28} />
        </div>
      )}

      {/* Error / empty overlay */}
      {isEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg">
          <div className="text-center space-y-2">
            <p className="text-3xl">⬡</p>
            <p className="text-slate-500 text-sm max-w-xs">
              {error ?? "Run ingest first to build the knowledge graph."}
            </p>
          </div>
        </div>
      )}

      {/* UI panels — only shown when graph is ready */}
      {!isLoading && !isEmpty && (
        <>
          {/* Legend */}
          <div className="absolute left-4 top-4 z-10 rounded-lg border border-border bg-sidebar/90 p-3 backdrop-blur-sm space-y-1.5">
            <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-1">
              Node types
            </p>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-[10px] text-slate-400 capitalize">
                  {type}
                </span>
              </div>
            ))}
          </div>

          {/* Stats + zoom controls (top-right) */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            <div className="font-mono text-[10px] text-slate-600 text-right space-y-0.5">
              <div>
                {rawCounts.nodes.toLocaleString()} nodes ·{" "}
                {rawCounts.edges.toLocaleString()} edges
              </div>
              {isSampled && (
                <div className="text-[9px] text-slate-700">
                  showing {graphData.nodes.length} /{" "}
                  {rawCounts.nodes.toLocaleString()}
                </div>
              )}
            </div>

            {/* Zoom controls */}
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-sidebar/90 backdrop-blur-sm p-1">
              <button
                onClick={zoomIn}
                title="Zoom in"
                className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={zoomOut}
                title="Zoom out"
                className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <ZoomOut size={14} />
              </button>
              <div className="border-t border-border my-0.5" />
              <button
                onClick={fitView}
                title="Fit to view"
                className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 shadow-xl cursor-pointer"
              onClick={() => setTooltip(null)}
            >
              <p className="text-sm font-medium text-slate-200">
                {tooltip.label}
              </p>
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                {tooltip.type} · {String(tooltip.id).slice(0, 24)}
              </p>
              <p className="font-mono text-[9px] text-slate-700 mt-1">
                click to dismiss
              </p>
            </div>
          )}

          {/* Navigation hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 font-mono text-[9px] text-slate-700 pointer-events-none">
            scroll to zoom · drag to pan · click node for details
          </div>
        </>
      )}

      {/* Canvas — always mounted so ResizeObserver gets real dimensions */}
      {!isLoading && graphData && graphData.nodes.length > 0 && (
        <FG
          ref={fgRef}
          graphData={graphData}
          nodeLabel="label"
          nodeColor="color"
          nodeVal="val"
          linkColor={() => "#2d2d4e"}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => setTooltip(null)}
          onEngineStop={handleEngineStop}
          backgroundColor="#06060a"
          enableZoomInteraction={true}
          enablePanInteraction={true}
          enableNodeDrag={true}
          warmupTicks={80}
          cooldownTicks={120}
          width={dims.w}
          height={dims.h}
          nodeCanvasObject={(node, ctx, gs) => {
            const r = ((node.val ?? 5) / gs) * 1.8;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = node.color ?? "#64748b";
            ctx.fill();
            if (gs > 2) {
              ctx.font = `${10 / gs}px IBM Plex Mono`;
              ctx.fillStyle = "rgba(203,213,225,0.7)";
              ctx.textAlign = "center";
              ctx.fillText(
                (node.label ?? "").slice(0, 24),
                node.x,
                node.y + r + 8 / gs,
              );
            }
          }}
          nodeCanvasObjectMode={() => "replace"}
        />
      )}
    </div>
  );
}
