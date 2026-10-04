// CSV mínimo pero correcto: comillas, saltos de línea dentro de celdas y detección de
// separador (Excel en español usa ";" y otros programas ","). Sin dependencias.

export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const counts = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';'
  if (counts['\t'] > counts[',']) return '\t'
  return ','
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

// Evita que Excel interprete un texto como fórmula (CSV injection)
function protectFormula(value: string): string {
  if (/^[=+@\t\r]/.test(value) || (/^-/.test(value) && !/^-?\d+([.,]\d+)?$/.test(value))) {
    return `'${value}`
  }
  return value
}

export function unprotectFormula(value: string): string {
  return /^'[=+@\-\t\r]/.test(value) ? value.slice(1) : value
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>, delimiter = ';'): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = protectFormula(v == null ? '' : String(v))
    return /["\n\r;,\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM para que Excel reconozca UTF-8 (tildes y ñ)
  return '﻿' + rows.map((r) => r.map(escape).join(delimiter)).join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
