// Unit tests for the control-tag parser that sits between the model and the
// write path (pure, no I/O). The chat works by the model emitting tags like
// <changes>/<clarify>/<propose_change>; the route extracts them with extractTag
// and strips them from the user-visible prose with stripTags. A regression here
// would mean a real action silently not firing, or raw tags leaking into chat.
// Run:  npx tsx scripts/verify-tag-extraction.ts

import { extractTag, stripTags } from "../src/lib/chat-helpers";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("extractTag pulls the first tag's inner content:");
{
  const raw = 'Added Apple. <changes>[{"action":"add","name":"Apple"}]</changes>';
  check("changes inner extracted", extractTag(raw, "changes") === '[{"action":"add","name":"Apple"}]', String(extractTag(raw, "changes")));
  check("absent tag → null", extractTag(raw, "clarify") === null);
  const multi = "<changes>A</changes> then <changes>B</changes>";
  check("only the FIRST same-tag match is returned", extractTag(multi, "changes") === "A", String(extractTag(multi, "changes")));
  const clarify = '<clarify>{"question":"How would you like to size it?","options":["Tell me units","I\'ll come back to it"]}</clarify>';
  check("clarify inner extracted", (extractTag(clarify, "clarify") ?? "").includes("size it"), String(extractTag(clarify, "clarify")));
}

console.log("stripTags removes control tags, leaves the prose:");
{
  check("changes stripped", stripTags('Done. <changes>[{"a":1}]</changes>') === "Done.", JSON.stringify(stripTags('Done. <changes>[{"a":1}]</changes>')));
  check("clarify stripped", stripTags('Quick check <clarify>{"q":1}</clarify>') === "Quick check", JSON.stringify(stripTags('Quick check <clarify>{"q":1}</clarify>')));
  check("suggested_replies stripped", stripTags('Pick one <suggested_replies>["EUR","USD"]</suggested_replies>') === "Pick one");
  check("context + goal stripped", stripTags('Logged <context>note</context><goal>{"t":1}</goal>') === "Logged");
  check("plain prose untouched", stripTags("Your net worth is up this month.") === "Your net worth is up this month.");
  // A multi-tag turn (commit + chips) leaves only the prose.
  const turn = 'Adding €5,000 of Nvidia. <propose_change>[{"action":"add"}]</propose_change>';
  check("propose_change stripped from prose", stripTags(turn) === "Adding €5,000 of Nvidia.", JSON.stringify(stripTags(turn)));
}

console.log(failures === 0 ? "\nAll tag-extraction checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
