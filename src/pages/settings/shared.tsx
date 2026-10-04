export function ReadOnlyNotice() {
  return (
    <p className="rounded-xl bg-stone-100 px-3.5 py-2.5 text-sm text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
      Tienes acceso de solo lectura en este inventario, así que no puedes modificar esta sección.
    </p>
  )
}

export function AdminOnlyNotice() {
  return (
    <p className="rounded-xl bg-stone-100 px-3.5 py-2.5 text-sm text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
      Solo el propietario y los administradores pueden modificar esta sección.
    </p>
  )
}
