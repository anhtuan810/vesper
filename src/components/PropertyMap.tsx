"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { streetViewUrlForAsset } from "@/lib/maps";
import type { RealEstateAsset } from "@/lib/supabase";
import type { StyleSpecification } from "maplibre-gl";
import mapStyleJson from "@/styles/map-dark.json";

interface Props {
  asset: RealEstateAsset;
}

const MAP_HEIGHT = 180;

function OpenInMapsOverlay({ asset }: { asset: RealEstateAsset }) {
  const url = streetViewUrlForAsset(asset.latitude, asset.longitude, asset.address);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(8px)",
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--text)",
        letterSpacing: "0.02em",
        display: "flex",
        alignItems: "center",
        gap: 5,
        textDecoration: "none",
        fontFamily: "var(--font-sans)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <path d="M128,224s-96-58.7-96-136a96,96,0,0,1,192,0C224,165.3,128,224,128,224Z" />
        <circle cx="128" cy="88" r="32" />
      </svg>
      Open in Maps
    </a>
  );
}

export function PropertyMap({ asset }: Props) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [cachedUrl, setCachedUrl] = useState(asset.photo_url ?? null);
  const photoFailedRef = useRef(false);

  const handleImgError = useCallback(() => {
    photoFailedRef.current = true;
    setCachedUrl(null);
  }, []);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: MAP_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    background: "var(--surface-elev)",
  };

  // If we have a cached map PNG, render it as a static image
  if (cachedUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={cachedUrl}
          alt=""
          onError={handleImgError}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <OpenInMapsOverlay asset={asset} />
      </div>
    );
  }

  // No lat/lng: empty placeholder
  if (!asset.latitude || !asset.longitude) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em", textAlign: "center", padding: "0 24px", fontFamily: "var(--font-sans)" }}>
          {asset.address?.trim() ? "Couldn't locate this address on the map" : "No address on file"}
        </div>
        <button
          onClick={() => router.push(`/chat?seed=${encodeURIComponent(`Update the address for ${asset.name}`)}`)}
          style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}
        >
          <span style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-sans)" }}>
            {asset.address?.trim() ? "Update address" : "Add address"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <MapLibreMap
      asset={asset}
      skipCaching={photoFailedRef.current}
      onCached={(url) => { setCachedUrl(url); router.refresh(); }}
    />
  );
}

interface MapLibreMapProps {
  asset: RealEstateAsset;
  skipCaching: boolean;
  onCached: (url: string) => void;
}

function MapLibreMap({ asset, skipCaching, onCached }: MapLibreMapProps) {
  const supabase = createBrowserSupabase();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasUploadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !asset.latitude || !asset.longitude) return;
    let mapInstance: { remove: () => void } | null = null;

    const init = async () => {
      const ml = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!containerRef.current) return;

      const map = new ml.Map({
        container: containerRef.current,
        style: mapStyleJson as unknown as StyleSpecification,
        center: [asset.longitude!, asset.latitude!],
        zoom: 15,
        interactive: false,
        attributionControl: false,
      });
      mapInstance = map;

      // Accent green pin matching the mockup
      const el = document.createElement("div");
      el.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%;
        background: var(--accent);
        border: 3px solid rgba(255,255,255,0.9);
        box-shadow: 0 0 0 4px rgba(74, 124, 94, 0.25), 0 2px 6px rgba(0,0,0,0.25);
      `;
      new ml.Marker({ element: el })
        .setLngLat([asset.longitude!, asset.latitude!])
        .addTo(map);

      map.once("idle", async () => {
        if (hasUploadedRef.current || skipCaching) return;
        hasUploadedRef.current = true;
        try {
          const canvas = map.getCanvas();
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error("canvas toBlob failed")); }, "image/png");
          });
          const path = `${asset.user_id}/${asset.id}-map.png`;
          const { error } = await supabase.storage.from("property-photos").upload(path, blob, { upsert: true, contentType: "image/png" });
          if (error) return;
          const { data: { publicUrl } } = supabase.storage.from("property-photos").getPublicUrl(path);
          await supabase.from("assets").update({ photo_url: publicUrl }).eq("id", asset.id);
          onCached(publicUrl);
        } catch {
          // caching failed silently
        }
      });
    };

    init();
    return () => { mapInstance?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: MAP_HEIGHT, borderRadius: 14, overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <OpenInMapsOverlay asset={asset} />
    </div>
  );
}
