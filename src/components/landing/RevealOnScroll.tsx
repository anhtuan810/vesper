"use client";

import { useEffect } from "react";

export function RevealOnScroll() {
  useEffect(() => {
    const selectors = ".reveal, .alert-chip-anim";

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(selectors).forEach((el) => el.classList.add("in-view"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(selectors).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
