// supabase/functions/_shared/images.ts
//
// Shared image fetching for the AI Edge Functions. The storage Content-Type
// header is never trusted — the media type is detected from magic bytes
// (see "Image Format Detection in Edge Functions" in CLAUDE.md).

import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export function detectMediaType(bytes: Uint8Array): ImageMediaType {
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  return 'image/jpeg'
}

export async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status}): ${imageUrl}`)
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = encodeBase64(arrayBuffer)
  const mediaType = detectMediaType(bytes)
  console.log(`Fetched image — detected media type: ${mediaType}`)
  return { base64, mediaType }
}
