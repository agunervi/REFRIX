import { supabase } from '../lib/supabase'
import { resizeImage } from '../lib/image'

const BUCKET = 'product-images'
const URL_TTL_SECONDS = 3600

const cache = new Map<string, { url: string; expiresAt: number }>()

export async function uploadProductImage(inventoryId: string, productKey: string, file: File): Promise<string> {
  const blob = await resizeImage(file)
  const path = `${inventoryId}/${productKey}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removeProductImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
  cache.delete(path)
}

/** URLs firmadas (el bucket es privado). Se cachean para no pedirlas en cada render. */
export async function getImageUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const result: Record<string, string> = {}
  const missing: string[] = []
  for (const p of new Set(paths)) {
    const hit = cache.get(p)
    if (hit && hit.expiresAt > now) result[p] = hit.url
    else missing.push(p)
  }
  if (missing.length > 0) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, URL_TTL_SECONDS)
    if (!error && data) {
      for (const item of data) {
        if (item.path && item.signedUrl) {
          result[item.path] = item.signedUrl
          cache.set(item.path, { url: item.signedUrl, expiresAt: now + (URL_TTL_SECONDS - 300) * 1000 })
        }
      }
    }
  }
  return result
}
