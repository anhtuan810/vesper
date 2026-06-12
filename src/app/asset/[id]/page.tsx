import { redirect } from "next/navigation";

// Legacy URL shape. The asset detail lives at /asset?id=<id> (a static shell
// the native bundle can carry); this server redirect keeps old web links and
// bookmarks working. Excluded from the native build (see scripts/build-native.mjs).
export default async function AssetIdRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/asset?id=${encodeURIComponent(id)}`);
}
