import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Loader2, ImageOff } from "lucide-react";

export default function ZoomableImage({ src, alt, className = "" }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  const containerRef = useRef(null);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
  }, [src]);

  const handleZoomIn = () => {
    setScale((s) => Math.min(s + 0.25, 4));
  };

  const handleZoomOut = () => {
    setScale((s) => {
      const nextScale = Math.max(s - 0.25, 0.5);
      if (nextScale <= 1) {
        setOffset({ x: 0, y: 0 });
      }
      return nextScale;
    });
  };

  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e) => {
    if (scale <= 1) return; // Only drag when zoomed in
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setOffset({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const wheelHandler = (e) => {
      e.preventDefault();
      const zoomFactor = 0.15;
      setScale((s) => {
        const next = s + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
        const val = Math.max(0.5, Math.min(next, 4));
        if (val <= 1) setOffset({ x: 0, y: 0 });
        return val;
      });
    };

    container.addEventListener("wheel", wheelHandler, { passive: false });
    return () => container.removeEventListener("wheel", wheelHandler);
  }, [scale]);

  return (
    <div className="relative group w-full h-full flex flex-col items-center">
      {/* Floating Toolbar Controls */}
      {!isError && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-2xl shadow-lg border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity select-none duration-250">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 hover:bg-white/10 text-white rounded-lg transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 hover:bg-white/10 text-white rounded-lg transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleReset}
            title="Reset View"
            className="p-1 hover:bg-white/10 text-white rounded-lg transition-colors border-l border-white/10 pl-1.5"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Image Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full overflow-hidden bg-neutral-100 rounded-2xl border border-black/5 flex items-center justify-center relative select-none touch-none ${
          scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        style={{ height: "450px" }}
      >
        {isLoading && !isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <span className="text-xs font-semibold text-slate-500">Loading Screenshot...</span>
          </div>
        )}

        {isError ? (
          <div className="flex flex-col items-center justify-center gap-2 text-rose-500 p-6 text-center">
            <ImageOff className="h-10 w-10 stroke-[1.5]" />
            <span className="text-xs font-bold text-slate-700">Unable to display screenshot</span>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800"
            >
              Open Image directly
            </a>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setIsError(true);
            }}
            className={`max-h-full max-w-full object-contain pointer-events-none transition-opacity duration-300 ${
              isLoading ? "opacity-0" : "opacity-100"
            } ${isDragging ? "" : "transition-transform duration-150 ease-out"}`}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center"
            }}
          />
        )}

        {/* Zoom Level Indicator */}
        {!isError && !isLoading && scale !== 1 && (
          <span className="absolute bottom-3 left-3 bg-black/60 text-white text-[9px] font-bold px-2 py-1 rounded-lg select-none pointer-events-none">
            Zoom: {Math.round(scale * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
