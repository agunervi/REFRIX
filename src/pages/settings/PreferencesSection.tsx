import { useRef, useState } from 'react'
import { Download, FileDown, FileUp, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Card, SectionTitle } from '../../components/ui/Misc'
import { Segmented } from '../../components/ui/Segmented'
import { Sheet } from '../../components/ui/Sheet'
import { Switch } from '../../components/ui/Switch'
import { useInventories } from '../../contexts/InventoryContext'
import { useInventoryData } from '../../contexts/InventoryDataContext'
import { useTheme, type ThemePref } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import {
  browserNotifyEnabled,
  browserNotifyPermission,
  disableBrowserNotify,
  enableBrowserNotify,
} from '../../lib/browserNotify'
import { downloadTextFile } from '../../lib/csv'
import { toUserMessage } from '../../lib/errors'
import { exportProductsCsv, importProducts, parseImport, templateCsv, type ImportReport, type ParsedRow } from '../../services/csvInventory'
import { removeExampleData } from '../../services/inventories'
import { ReadOnlyNotice } from './shared'

function slug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'inventario'
}

function stamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PreferencesSection() {
  const data = useInventoryData()
  const { refresh } = useInventories()
  const theme = useTheme()
  const toast = useToast()
  const confirm = useConfirm()
  const [browserOn, setBrowserOn] = useState(browserNotifyEnabled)
  const [removingExample, setRemovingExample] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const permission = browserNotifyPermission()
  const hasExample =
    data.products.some((p) => p.is_example) ||
    data.locations.some((l) => l.is_example) ||
    data.categories.some((c) => c.is_example) ||
    data.subcategories.some((s) => s.is_example)

  const toggleBrowser = async (on: boolean) => {
    if (!on) {
      disableBrowserNotify()
      setBrowserOn(false)
      return
    }
    const result = await enableBrowserNotify()
    if (result === 'granted') {
      setBrowserOn(true)
      toast.success('Listo. Recibirás avisos del navegador mientras la app esté abierta en segundo plano.')
    } else if (result === 'unsupported') {
      toast.error('Este navegador no admite notificaciones.')
    } else {
      toast.error('El permiso fue denegado. Puedes habilitarlo en los ajustes del sitio de tu navegador.')
    }
  }

  const exportCsv = () => {
    const csv = exportProductsCsv(data.products, data.locations, data.categories, data.subcategories)
    downloadTextFile(`${slug(data.inventory.name)}-${stamp()}.csv`, csv)
    toast.success(`Exportados ${data.products.length} productos.`)
  }

  const removeExample = async () => {
    const ok = await confirm({
      title: 'Eliminar datos de ejemplo',
      message: 'Se borran los productos, ubicaciones, categorías y subcategorías de muestra. Lo que creaste tú no se toca.',
      confirmLabel: 'Eliminar ejemplo',
      danger: true,
    })
    if (!ok) return
    setRemovingExample(true)
    try {
      await data.track(removeExampleData(data.inventory.id))
      await data.reload()
      await refresh()
      toast.success('Datos de ejemplo eliminados.')
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setRemovingExample(false)
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Apariencia" className="space-y-2">
        <SectionTitle>Apariencia</SectionTitle>
        <Segmented<ThemePref>
          label="Tema"
          value={theme.pref}
          onChange={theme.setPref}
          options={[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
            { value: 'system', label: 'Automático' },
          ]}
        />
      </section>

      <section aria-label="Avisos del navegador" className="space-y-2">
        <SectionTitle>Avisos del navegador</SectionTitle>
        <Card className="px-4">
          <Switch
            label="Notificaciones en este dispositivo"
            description={
              permission === 'unsupported'
                ? 'Tu navegador no las admite.'
                : permission === 'denied'
                  ? 'Bloqueadas en tu navegador. Habilítalas en los ajustes del sitio.'
                  : 'Aparecen cuando llega una alerta y la app está en segundo plano.'
            }
            checked={browserOn && permission === 'granted'}
            disabled={permission === 'unsupported' || permission === 'denied'}
            onChange={(v) => void toggleBrowser(v)}
          />
        </Card>
        <p className="text-xs text-stone-500 dark:text-neutral-400">
          Funcionan con la app abierta (también en segundo plano o instalada). Con la app cerrada el aviso confiable es el correo.
        </p>
      </section>

      <section aria-label="Datos" className="space-y-2">
        <SectionTitle>Datos del inventario</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" icon={<FileDown className="h-5 w-5" />} onClick={exportCsv} disabled={data.products.length === 0}>
            Exportar a CSV
          </Button>
          <Button variant="secondary" icon={<FileUp className="h-5 w-5" />} onClick={() => setImportOpen(true)} disabled={!data.canWrite}>
            Importar desde CSV
          </Button>
        </div>
        {!data.canWrite && <ReadOnlyNotice />}
      </section>

      {hasExample && data.canWrite && (
        <section aria-label="Datos de ejemplo" className="space-y-2">
          <SectionTitle>Datos de ejemplo</SectionTitle>
          <Card className="flex items-center gap-3 p-4">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
            <p className="flex-1 text-sm text-stone-600 dark:text-neutral-300">Este inventario tiene datos de muestra que puedes quitar cuando quieras.</p>
            <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} loading={removingExample} onClick={() => void removeExample()}>
              Quitar
            </Button>
          </Card>
        </section>
      )}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Importar desde CSV" description="Se agregan productos nuevos; no se modifican ni se borran los que ya tienes." size="lg">
      {open && <ImportForm onClose={onClose} />}
    </Sheet>
  )
}

function ImportForm({ onClose }: { onClose: () => void }) {
  const data = useInventoryData()
  const { refresh } = useInventories()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; skipped: ImportReport['skipped'] } | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReport(null)
    setFatal(null)
    setParsed(null)
    setFileName(file.name)
    if (file.size > 5 * 1024 * 1024) return setFatal('El archivo pesa más de 5 MB.')
    try {
      const text = await file.text()
      const result = parseImport(text)
      if (result.fatal) setFatal(result.fatal)
      else setParsed({ rows: result.rows, skipped: result.skipped })
    } catch {
      setFatal('No se pudo leer el archivo.')
    }
  }

  const run = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      const r = await data.track(importProducts(data.inventory.id, parsed.rows))
      await data.reload()
      await refresh()
      setReport({ ...r, skipped: parsed.skipped })
      toast.success(`Importados ${r.imported} productos.`)
    } catch (e) {
      setFatal(toUserMessage(e))
      void data.reload()
    } finally {
      setBusy(false)
    }
  }

  if (report) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-700 dark:text-neutral-200">
          Se importaron <strong>{report.imported}</strong> productos
          {report.createdLocations + report.createdCategories > 0 &&
            ` y se crearon ${report.createdLocations} ubicaciones y ${report.createdCategories} categorías nuevas`}
          .
        </p>
        {report.skipped.length > 0 && <SkippedList skipped={report.skipped} />}
        <Button full onClick={onClose}>Listo</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-stone-100 p-3.5 text-sm text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
        <p>
          Columnas obligatorias: <strong>Nombre, Ubicación, Categoría, Cantidad, Unidad, Stock mínimo</strong>. Opcionales: Subcategoría, Marca, Vencimiento (AAAA-MM-DD o DD/MM/AAAA) y Notas. Las ubicaciones y categorías que no existan se crean solas.
        </p>
        <Button variant="ghost" size="sm" className="mt-2" icon={<Download className="h-4 w-4" />} onClick={() => downloadTextFile('plantilla-inventario.csv', templateCsv())}>
          Descargar plantilla
        </Button>
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <Button variant="secondary" full icon={<FileUp className="h-5 w-5" />} onClick={() => fileRef.current?.click()}>
        {fileName ?? 'Elegir archivo CSV'}
      </Button>

      {fatal && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{fatal}</p>}

      {parsed && (
        <div className="space-y-3">
          <p className="text-sm text-stone-700 dark:text-neutral-200">
            <strong>{parsed.rows.length}</strong> productos listos para importar
            {parsed.skipped.length > 0 && <>, <strong>{parsed.skipped.length}</strong> filas con errores que se omitirán</>}.
          </p>
          {parsed.skipped.length > 0 && <SkippedList skipped={parsed.skipped} />}
          <Button size="lg" full loading={busy} disabled={parsed.rows.length === 0} onClick={() => void run()}>
            Importar {parsed.rows.length} productos
          </Button>
        </div>
      )}
    </div>
  )
}

function SkippedList({ skipped }: { skipped: ImportReport['skipped'] }) {
  return (
    <details className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <summary className="cursor-pointer font-medium">Ver filas omitidas ({skipped.length})</summary>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {skipped.slice(0, 100).map((s) => (
          <li key={s.line}>Fila {s.line}: {s.reason}</li>
        ))}
        {skipped.length > 100 && <li>... y {skipped.length - 100} más.</li>}
      </ul>
    </details>
  )
}
