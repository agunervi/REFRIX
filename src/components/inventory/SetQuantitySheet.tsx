import { useState, type FormEvent } from 'react'
import { formatQty } from '../../lib/stock'
import type { Product } from '../../types/database'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

export function parseNumber(value: string): number {
  return Number(value.trim().replace(',', '.'))
}

/** Ingreso manual de una cantidad exacta. */
export function SetQuantitySheet({
  product,
  onClose,
  onSave,
}: {
  product: Product | null
  onClose: () => void
  onSave: (product: Product, quantity: number) => void
}) {
  return (
    <Sheet open={product !== null} onClose={onClose} title={product ? `Cantidad de ${product.name}` : ''}>
      {product && <Form key={product.id} product={product} onClose={onClose} onSave={onSave} />}
    </Sheet>
  )
}

function Form({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (p: Product, q: number) => void }) {
  const [value, setValue] = useState(String(product.quantity).replace('.', ','))
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = parseNumber(value)
    if (value.trim() === '' || Number.isNaN(n) || n < 0) {
      setError('Ingresa un número mayor o igual a cero.')
      return
    }
    onSave(product, Math.round(n * 1000) / 1000)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-stone-500 dark:text-neutral-400">
        Ahora hay {formatQty(product.quantity)} {product.unit}. Stock mínimo: {formatQty(product.min_stock)}.
      </p>
      <Field label={`Cantidad (${product.unit})`} error={error}>
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        )}
      </Field>
      <Button type="submit" size="lg" full>
        Guardar cantidad
      </Button>
    </form>
  )
}
