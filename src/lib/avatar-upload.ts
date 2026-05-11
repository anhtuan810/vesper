import { createBrowserSupabase } from "./supabase";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const ext = MIME_TO_EXT[file.type] ?? "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from("user-avatars")
    .upload(path, file, { upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("user-avatars").getPublicUrl(path);
  return data.publicUrl;
}
