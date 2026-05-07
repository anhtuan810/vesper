"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { streetViewUrl, streetViewUrlForAsset } from "@/lib/maps";
import type { RealEstateAsset } from "@/lib/supabase";
import type { StyleSpecification } from "maplibre-gl";
import mapStyleJson from "@/styles/map-dark.json";

interface Props {
  asset: RealEstateAsset;
}

const BUCKET = "property-photos";

function StreetViewOverlay({ asset }: { asset: RealEstateAsset }) {
  if (!asset.latitude || !asset.longitude) return null;
  const url = streetViewUrl(asset.latitude, asset.longitude);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "absolute", bottom: 12, right: 12,
        background: "rgba(10,10,11,0.82)",
        backdropFilter: "blur(8px)",
        border: "1px solid var(--border-strong)",
        borderRadius: 999,
        padding: "6px 11px 6px 9px",
        display: "flex", alignItems: "center", gap: 6,
        color: "var(--text)",
        textDecoration: "none",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
      </svg>
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.06em" }}>Street view</span>
    </a>
  );
}

export function PropertyMap({ asset }: Props) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [effectivePhotoUrl, setEffectivePhotoUrl] = useState(asset.photo_url ?? null);
  // Prevents re-caching loop when a cached URL turns out to be un-servable
  const photoFailedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 11",
    background: "var(--surface)",
    overflow: "hidden",
  };

  // Handle user photo upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${asset.user_id}/${asset.id}-user.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) return;

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    await supabase.from("assets").update({ photo_url: publicUrl }).eq("id", asset.id);
    await supabase.from("mutations").insert({
      user_id: asset.user_id,
      asset_id: asset.id,
      asset_name: asset.name,
      action: "edit",
      after_value: asset.value,
      before_value: asset.value,
      personal_context: "Photo added",
      occurred_at: new Date().toISOString(),
    });

    photoFailedRef.current = false;
    setEffectivePhotoUrl(publicUrl);
    router.refresh();
  }, [asset, supabase, router]);

  const handleImgError = useCallback(() => {
    photoFailedRef.current = true;
    setEffectivePhotoUrl(null);
  }, []);

  // Photo hint overlay (top-left)
  const photoHint = (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          position: "absolute", top: 12, left: 12,
          background: "rgba(10,10,11,0.6)",
          backdropFilter: "blur(6px)",
          border: "none",
          padding: "4px 8px",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        <span className="font-mono" style={{ fontSize: 8, color: "rgba(245,244,238,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {effectivePhotoUrl ? "Change photo" : "Map · Tap to add photo"}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </>
  );

  // If photo_url is already set, render static image
  if (effectivePhotoUrl) {
    const streetViewUrl = streetViewUrlForAsset(asset.latitude, asset.longitude, asset.address);
    return (
      <div style={containerStyle}>
        {streetViewUrl ? (
          <a href={streetViewUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
            <img
              src={effectivePhotoUrl}
              alt=""
              onError={handleImgError}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </a>
        ) : (
          <img
            src={effectivePhotoUrl}
            alt=""
            onError={handleImgError}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
        {photoHint}
        <StreetViewOverlay asset={asset} />
      </div>
    );
  }

  // No lat/lng: empty placeholder with "Add address" CTA
  if (!asset.latitude || !asset.longitude) {
    return (
      <div
        style={{
          ...containerStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          className="font-mono"
          style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}
        >
          No address on file
        </div>
        <button
          onClick={() => router.push("/chat")}
          style={{
            background: "none",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "5px 14px",
            cursor: "pointer",
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            Add address
          </span>
        </button>
        {photoHint}
        <StreetViewOverlay asset={asset} />
      </div>
    );
  }

  // Render MapLibre map (will cache after first render unless a previous cached URL failed)
  return (
    <MapLibreMap
      asset={asset}
      skipCaching={photoFailedRef.current}
      onCached={(url) => { setEffectivePhotoUrl(url); router.refresh(); }}
      photoHint={photoHint}
    />
  );
}

interface MapLibreMapProps {
  asset: RealEstateAsset;
  skipCaching: boolean;
  onCached: (url: string) => void;
  photoHint: React.ReactNode;
}

function MapLibreMap({ asset, skipCaching, onCached, photoHint }: MapLibreMapProps) {
  const supabase = createBrowserSupabase();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasUploadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !asset.latitude || !asset.longitude) return;

    let mapInstance: { remove: () => void } | null = null;

    const init = async () => {
      // Dynamic import keeps MapLibre out of the initial bundle
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

      // Amber pin
      const el = document.createElement("div");
      el.style.cssText = `
        width:14px; height:14px; border-radius:50%;
        background:#D4A574;
        border: 2px solid rgba(10,10,11,0.8);
        box-shadow: 0 0 0 6px rgba(212,165,116,0.2);
      `;
      new ml.Marker({ element: el })
        .setLngLat([asset.longitude!, asset.latitude!])
        .addTo(map);

      // After map has finished rendering all tiles, capture and cache
      map.once("idle", async () => {
        if (hasUploadedRef.current || skipCaching) return;
        hasUploadedRef.current = true;

        try {
          const canvas = map.getCanvas();
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => {
              if (b) resolve(b);
              else reject(new Error("canvas toBlob failed"));
            }, "image/png");
          });

          const path = `${asset.user_id}/${asset.id}-map.png`;
          const { error } = await supabase.storage
            .from("property-photos")
            .upload(path, blob, { upsert: true, contentType: "image/png" });

          if (error) return;

          const { data: { publicUrl } } = supabase.storage
            .from("property-photos")
            .getPublicUrl(path);

          await supabase.from("assets").update({ photo_url: publicUrl }).eq("id", asset.id);
          onCached(publicUrl);
        } catch {
          // Caching failed silently; map continues to render on next load
        }
      });
    };

    init();

    return () => { mapInstance?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const streetViewUrl = streetViewUrlForAsset(asset.latitude, asset.longitude, asset.address);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 11", overflow: "hidden" }}>
      {streetViewUrl ? (
        <a
          href={streetViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        </a>
      ) : (
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      )}
      {photoHint}
      <StreetViewOverlay asset={asset} />
    </div>
  );
}
