"use client";

import { useState } from "react";
import { COMPOSER_PLACEHOLDER } from "./data";

// The decision composer — the single input the mockup uses in both the chat
// rail foot and the narrow-screen dock. Interactive only insofar as the field
// is editable; it is NOT wired to the chat agent yet (visual port).
// TODO(real-data): submit the entry to the chat agent / mutations pipeline.
export function Composer() {
  const [value, setValue] = useState("");

  return (
    <div className="composer">
      <svg className="ci" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18M3 8l4-4 4 4M21 16l-4 4-4-4" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={COMPOSER_PLACEHOLDER}
        aria-label="Tell Volnar what changed"
      />
      <button className="send" type="button" aria-label="Send">
        <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
