import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { getImageUrls } from '../../services/images'
import { cn } from '../../utils/cn'

/** Muestra la foto de un producto (el bucket es privado: usa URLs firmadas temporales). */
export function ProductImage({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailed(false)
    if (!path) return
    getImageUrls([path])
      .then((map) => active && setUrl(map[path] ?? null))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [path])

  if (!path) return null
  if (failed || (!url && failed)) {
    return (
      <div className={cn('flex items-center justify-center bg-stone-100 text-stone-400 dark:bg-neutral-800', className)}>
        <ImageOff className="h-5 w-5" aria-hidden />
      </div>
    )
  }
  if (!url) return <div className={cn('animate-pulse bg-stone-100 dark:bg-neutral-800', className)} />
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} />
}
