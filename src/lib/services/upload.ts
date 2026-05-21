import { insforge } from "../core/insforge";

const BUCKET = "cafe-images";

export type UploadResult = {
  url: string;
  key: string;
};

export async function uploadImage(file: File, folder: string): Promise<UploadResult> {
  const ext = file.name.split(".").pop() || "jpg";
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await insforge.storage
    .from(BUCKET)
    .upload(key, file);

  if (error) throw error;
  if (!data) throw new Error("Upload returned no data");

  return { url: data.url, key: data.key };
}

export async function deleteImage(key: string): Promise<void> {
  const { error } = await insforge.storage
    .from(BUCKET)
    .remove(key);

  if (error) throw error;
}

export function getPublicUrl(key: string): string {
  return `${import.meta.env.VITE_INSFORGE_URL}/api/storage/buckets/${BUCKET}/objects/${key}`;
}

export function extractStorageKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/objects\/(.+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
