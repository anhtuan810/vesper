"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
}

const TITLE_ID = "profile-field-sheet-title";

export default function ProfileFieldSheet({ open, title, body, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setMounted(true);
      document.body.style.overflow = "hidden";
      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setVisible(true);
        });
      });
      return () => { cancelled = true; };
    } else {
      setVisible(false);
      document.body.style.overflow = "";
      const timer = setTimeout(() => {
        setMounted(false);
        if (previousFocusRef.current instanceof HTMLElement) {
          previousFocusRef.current.focus();
        }
      }, 240);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (visible) closeButtonRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 200,
          opacity: visible ? 1 : 0,
          transition: "opacity 180ms ease-out",
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            if (document.activeElement === closeButtonRef.current) {
              sheetRef.current?.focus();
            } else {
              closeButtonRef.current?.focus();
            }
          }
        }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: "24px 22px calc(32px + env(safe-area-inset-bottom))",
          maxHeight: "80vh",
          overflowY: "auto",
          zIndex: 201,
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 240ms cubic-bezier(0.2, 0, 0.1, 1)",
          outline: "none",
        }}
      >
        {/* Handle bar */}
        <div style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: "var(--text-faint)",
          opacity: 0.4,
          margin: "0 auto 20px",
        }} />

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div
            id={TITLE_ID}
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--hero)",
              fontVariationSettings: "'opsz' 24",
              lineHeight: 1.2,
              flex: 1,
            }}
          >
            {title}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              padding: 0,
              flexShrink: 0,
              marginLeft: 8,
              borderRadius: 8,
            }}
          >
            <svg
              width="22" height="22" viewBox="0 0 256 256" fill="none"
              stroke="currentColor" strokeWidth="14" strokeLinecap="round"
            >
              <line x1="48" y1="48" x2="208" y2="208" />
              <line x1="208" y1="48" x2="48" y2="208" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}>
          {body}
        </div>
      </div>
    </>
  );
}
