import { redirect } from "next/navigation";

// The four-mode scenario surface (Adjust | Project | Look back | Stress test) has
// been replaced by the chat-driven scenario explore reached from Portfolio. This
// route is retained only to redirect any old links back to the portfolio, where
// the ambient projection teaser is the single scenario entry.
export default function ScenariosPage() {
  redirect("/");
}
