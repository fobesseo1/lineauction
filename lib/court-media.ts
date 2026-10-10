// Court photos are already 640px WebP, either local (/media/court) or in the public
// Supabase Storage bucket; serve them as-is instead of re-encoding through next/image.
export function isPreparedCourtPhoto(src: string) {
  return src.endsWith(".webp") && (src.startsWith("/media/court/") || src.includes("/storage/v1/object/public/court-media/"));
}
