<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editorRef = useTemplateRef<HTMLDivElement>('editor')
const fileRef = useTemplateRef<HTMLInputElement>('file')
const pickerAnchorRef = useTemplateRef<HTMLDivElement>('pickerAnchor')
const importing = ref(false)
const exporting = ref(false)
const error = ref('')
const fileName = ref('document')

const showDatePicker = ref(false)
const pickerYear = ref(new Date().getFullYear())
const pickerMonth = ref(new Date().getMonth())
const dateFormat = ref('dash')
let savedRange: Range | null = null

const hostRef = useTemplateRef<HTMLDivElement>('host')
const fieldPickerRef = useTemplateRef<HTMLDivElement>('fieldPicker')
const showFieldPicker = ref(false)
const fieldPickerX = ref(0)
const fieldPickerY = ref(0)
const editingField = ref<HTMLElement | null>(null)
const autoUpdate = ref(false)
const fieldBlock = ref(false)

const restricted = ref(false)
const currentRegion = ref<HTMLElement | null>(null)

const weekdays = ['一', '二', '三', '四', '五', '六', '日']

interface DayCell {
  date: Date
  inMonth: boolean
  isToday: boolean
}

const dayCells = computed<DayCell[]>(() => {
  const first = new Date(pickerYear.value, pickerMonth.value, 1)
  const start = new Date(pickerYear.value, pickerMonth.value, 1 - ((first.getDay() + 6) % 7))
  const today = new Date()
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      date,
      inMonth: date.getMonth() === pickerMonth.value,
      isToday: date.toDateString() === today.toDateString(),
    })
  }
  return cells
})

const wordCount = computed(() =>
  (props.modelValue ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, '')
    .length,
)

function currentHtml(): string {
  return editorRef.value?.innerHTML ?? ''
}

function sync(): void {
  emit('update:modelValue', currentHtml())
}

onMounted(() => {
  if (editorRef.value && props.modelValue !== undefined) {
    editorRef.value.innerHTML = props.modelValue
    refreshAutoFields()
  }
  document.addEventListener('mousedown', onDocumentMousedown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
})

watch(
  () => props.modelValue,
  (value) => {
    if (editorRef.value && value !== undefined && value !== editorRef.value.innerHTML) {
      editorRef.value.innerHTML = value
      currentRegion.value = null
      refreshAutoFields()
    }
  },
)

function exec(cmd: string, value?: string): void {
  editorRef.value?.focus()
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(cmd, false, value)
  sync()
}

function onFormatBlock(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value) exec('formatBlock', value)
}

function onFontSize(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value) exec('fontSize', value)
}

function onColor(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (value) exec('foreColor', value)
}

function insertTable(): void {
  let html = '<table style="width:100%;border-collapse:collapse">'
  for (let r = 0; r < 3; r++) {
    html += '<tr>'
    for (let c = 0; c < 2; c++) {
      html += '<td style="border:1px solid #bbb;padding:6px;min-height:1em">&nbsp;</td>'
    }
    html += '</tr>'
  }
  html += '</table><p></p>'
  exec('insertHTML', html)
}

const showTableTools = ref(false)
const tableToolsX = ref(0)
const tableToolsY = ref(0)
const addBtnX = ref(0)
const addBtnY = ref(0)
const activeTable = ref<HTMLTableElement | null>(null)
const activeCell = ref<HTMLTableCellElement | null>(null)

function cellSpan(cell: Element): number {
  return Math.max(1, Number.parseInt(cell.getAttribute('colspan') ?? '', 10) || 1)
}

function rowGrid(row: HTMLTableRowElement): Array<{ cell: HTMLTableCellElement; start: number; span: number }> {
  const info: Array<{ cell: HTMLTableCellElement; start: number; span: number }> = []
  let start = 0
  for (const cell of Array.from(row.cells)) {
    const span = cellSpan(cell)
    info.push({ cell, start, span })
    start += span
  }
  return info
}

function columnIndex(cell: HTMLTableCellElement): number {
  const row = cell.closest('tr')
  if (!(row instanceof HTMLTableRowElement)) return 0
  let index = 0
  for (const c of Array.from(row.cells)) {
    if (c === cell) return index
    index += cellSpan(c)
  }
  return index
}

function hideTableTools(): void {
  showTableTools.value = false
  activeTable.value = null
  activeCell.value = null
}

function placeTableTools(): void {
  const host = hostRef.value
  const table = activeTable.value
  const cell = activeCell.value
  if (!host || !table || !cell || !table.contains(cell)) {
    hideTableTools()
    return
  }
  const hostRect = host.getBoundingClientRect()
  const tableRect = table.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  tableToolsX.value = Math.max(8, Math.min(cellRect.left - hostRect.left, host.clientWidth - 330))
  tableToolsY.value = Math.max(4, tableRect.top - hostRect.top - 40)
  addBtnX.value = tableRect.left - hostRect.left + tableRect.width / 2 - 12
  addBtnY.value = tableRect.bottom - hostRect.top + 6
}

function refreshAfterTableEdit(): void {
  const cell = activeCell.value
  if (cell?.isConnected && activeTable.value?.contains(cell)) {
    placeTableTools()
    return
  }
  const table = activeTable.value
  const firstCell = table?.isConnected ? table.rows[0]?.cells[0] : undefined
  if (table?.isConnected && firstCell) {
    activeCell.value = firstCell
    placeTableTools()
  } else {
    hideTableTools()
  }
}

function insertRow(refRow: HTMLTableRowElement, below: boolean): void {
  const parent = refRow.parentNode
  if (!parent) return
  const newRow = document.createElement('tr')
  for (const src of Array.from(refRow.cells)) {
    const tag = src.tagName.toLowerCase() === 'th' ? 'th' : 'td'
    const cell = document.createElement(tag)
    const colspan = src.getAttribute('colspan')
    if (colspan) cell.setAttribute('colspan', colspan)
    const style = src.getAttribute('style')
    if (style) cell.setAttribute('style', style)
    cell.innerHTML = '&nbsp;'
    newRow.appendChild(cell)
  }
  parent.insertBefore(newRow, below ? refRow.nextSibling : refRow)
  sync()
  refreshAfterTableEdit()
}

function insertColumnAt(table: HTMLTableElement, index: number): void {
  for (const row of Array.from(table.rows)) {
    const info = rowGrid(row)
    const spanning = info.find((c) => index > c.start && index < c.start + c.span)
    if (spanning) {
      spanning.cell.setAttribute('colspan', String(spanning.span + 1))
      continue
    }
    const ref = info.find((c) => c.start >= index)
    const template = ref?.cell ?? info[info.length - 1]?.cell
    const tag = template && template.tagName.toLowerCase() === 'th' ? 'th' : 'td'
    const newCell = document.createElement(tag)
    const style = template?.getAttribute('style')
    if (style) newCell.setAttribute('style', style)
    newCell.innerHTML = '&nbsp;'
    if (ref) row.insertBefore(newCell, ref.cell)
    else row.appendChild(newCell)
  }
  sync()
  refreshAfterTableEdit()
}

function deleteColumnAt(table: HTMLTableElement, index: number): void {
  for (const row of Array.from(table.rows)) {
    const info = rowGrid(row)
    const exact = info.find((c) => c.start === index)
    if (exact) {
      exact.cell.remove()
      continue
    }
    const spanning = info.find((c) => index > c.start && index < c.start + c.span)
    if (spanning && spanning.span > 1) {
      spanning.cell.setAttribute('colspan', String(spanning.span - 1))
    }
  }
  const empty = !table.rows.length || Array.from(table.rows).every((r) => r.cells.length === 0)
  if (empty) table.remove()
  sync()
  refreshAfterTableEdit()
}

function rowOp(where: 'above' | 'below' | 'end'): void {
  const table = activeTable.value
  if (!table) return
  let refRow: HTMLTableRowElement | undefined
  if (where === 'end') {
    refRow = table.rows[table.rows.length - 1]
  } else {
    refRow = activeCell.value?.closest('tr') ?? undefined
  }
  if (refRow instanceof HTMLTableRowElement) insertRow(refRow, where !== 'above')
}

function colOp(where: 'left' | 'right'): void {
  const table = activeTable.value
  const cell = activeCell.value
  if (!table || !cell) return
  const index = columnIndex(cell) + (where === 'right' ? cellSpan(cell) : 0)
  insertColumnAt(table, index)
}

function deleteRow(): void {
  const row = activeCell.value?.closest('tr')
  const table = activeTable.value
  if (!(row instanceof HTMLTableRowElement) || !table) return
  row.remove()
  if (!table.rows.length) table.remove()
  sync()
  refreshAfterTableEdit()
}

function deleteCol(): void {
  const table = activeTable.value
  const cell = activeCell.value
  if (!table || !cell) return
  deleteColumnAt(table, columnIndex(cell))
}

function deleteTable(): void {
  activeTable.value?.remove()
  hideTableTools()
  sync()
}

function shiftMonth(delta: number): void {
  const d = new Date(pickerYear.value, pickerMonth.value + delta, 1)
  pickerYear.value = d.getFullYear()
  pickerMonth.value = d.getMonth()
}

function togglePicker(): void {
  if (showDatePicker.value) {
    showDatePicker.value = false
    return
  }
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && editorRef.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange()
  }
  const now = new Date()
  pickerYear.value = now.getFullYear()
  pickerMonth.value = now.getMonth()
  showDatePicker.value = true
}

function formatDateWith(fmt: string, d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  switch (fmt) {
    case 'slash':
      return `${y}/${m}/${day}`
    case 'cn':
      return `${y}年${d.getMonth() + 1}月${d.getDate()}日`
    default:
      return `${y}-${m}-${day}`
  }
}

function formatDate(d: Date): string {
  return formatDateWith(dateFormat.value, d)
}

const FIELD_ICON =
  '<svg class="field-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4.5 3V1.5M11.5 3V1.5M2.8 14.5h10.4a1.3 1.3 0 0 0 1.3-1.3V5.8a1.3 1.3 0 0 0-1.3-1.3H2.8A1.3 1.3 0 0 0 1.5 5.8v7.4a1.3 1.3 0 0 0 1.3 1.3ZM1.5 8h13"/></svg>'

const DATE_PATTERN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{4})年(\d{1,2})月(\d{1,2})日/g
const DATE_TEST = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{4})年(\d{1,2})月(\d{1,2})日/

function setFieldLabel(field: HTMLElement, text: string): void {
  let label = field.querySelector<HTMLSpanElement>('.field-label')
  if (!label) {
    field.textContent = ''
    field.insertAdjacentHTML('afterbegin', FIELD_ICON)
    label = document.createElement('span')
    label.className = 'field-label'
    field.appendChild(label)
  }
  label.textContent = text
}

function parseDateMatch(m: RegExpExecArray): { date: Date; fmt: string } | null {
  const y = Number(m[1] ?? m[4])
  const mo = Number(m[2] ?? m[5])
  const d = Number(m[3] ?? m[6])
  const fmt = m[4] !== undefined ? 'cn' : m[0].includes('/') ? 'slash' : 'dash'
  const date = new Date(y, mo - 1, d)
  if (!Number.isInteger(y) || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null
  }
  return { date, fmt }
}

function buildDateField(date: Date, fmt: string, block = false): HTMLElement {
  const field = document.createElement('span')
  field.className = 'date-field'
  field.title = '点击修改日期'
  field.contentEditable = 'false'
  field.dataset.format = fmt
  field.dataset.auto = '0'
  field.dataset.block = block ? '1' : '0'
  field.insertAdjacentHTML('afterbegin', FIELD_ICON)
  const label = document.createElement('span')
  label.className = 'field-label'
  label.textContent = formatDateWith(fmt, date)
  field.appendChild(label)
  return field
}

function enhanceImportedDates(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('.date-field') || !DATE_TEST.test(node.textContent ?? '')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text)
  for (const textNode of targets) {
    const text = textNode.textContent ?? ''
    const frag = document.createDocumentFragment()
    let last = 0
    DATE_PATTERN.lastIndex = 0
    for (let m = DATE_PATTERN.exec(text); m; m = DATE_PATTERN.exec(text)) {
      const parsed = parseDateMatch(m)
      if (!parsed) continue
      if (m.index > last) frag.append(text.slice(last, m.index))
      frag.append(buildDateField(parsed.date, parsed.fmt))
      last = m.index + m[0].length
    }
    if (last === 0) continue
    if (last < text.length) frag.append(text.slice(last))
    textNode.replaceWith(frag)
  }
}

function insertDate(d: Date): void {
  if (savedRange && editorRef.value) {
    editorRef.value.focus()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedRange)
    savedRange = null
  }
  exec('insertHTML', `<span>${formatDate(d)}</span>&nbsp;`)
  showDatePicker.value = false
}

function onDocumentMousedown(e: MouseEvent): void {
  if (showDatePicker.value) {
    const anchor = pickerAnchorRef.value
    if (!(anchor && e.target instanceof Node && anchor.contains(e.target))) {
      showDatePicker.value = false
    }
  }
  if (showFieldPicker.value) {
    const target = e.target as Element | null
    if (!target?.closest?.('.field-picker, .date-field, .field-btn')) {
      closeFieldPicker()
    }
  }
  if (showTableTools.value) {
    const target = e.target as Element | null
    if (!target?.closest?.('.table-tools, .table-add, td, th')) {
      hideTableTools()
    }
  }
}

function positionFieldPicker(rect: DOMRect): void {
  const host = hostRef.value
  if (!host) return
  const hostRect = host.getBoundingClientRect()
  const width = 258
  const left = Math.max(8, Math.min(rect.left - hostRect.left, host.clientWidth - width - 8))
  fieldPickerX.value = left
  fieldPickerY.value = rect.bottom - hostRect.top + 6
}

function closeFieldPicker(): void {
  editingField.value?.classList.remove('active')
  editingField.value = null
  showFieldPicker.value = false
}

function openFieldPickerFromButton(event: MouseEvent): void {
  closeFieldPicker()
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && editorRef.value?.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange()
  }
  autoUpdate.value = false
  fieldBlock.value = false
  positionFieldPicker((event.currentTarget as HTMLElement).getBoundingClientRect())
  showFieldPicker.value = true
}

function openFieldPickerForEdit(field: HTMLElement): void {
  closeFieldPicker()
  editingField.value = field
  field.classList.add('active')
  dateFormat.value = field.dataset.format ?? 'dash'
  autoUpdate.value = field.dataset.auto === '1'
  fieldBlock.value = field.dataset.block === '1'
  positionFieldPicker(field.getBoundingClientRect())
  showFieldPicker.value = true
}

function onEditorClick(event: MouseEvent): void {
  const target = event.target as Element | null
  const field = target?.closest?.('.date-field')
  if (field) {
    if (restricted.value && !field.closest('.edit-region')) return
    openFieldPickerForEdit(field as HTMLElement)
    return
  }
  const cellEl = target?.closest?.('td, th')
  if (
    cellEl instanceof HTMLTableCellElement &&
    editorRef.value?.contains(cellEl) &&
    !restricted.value
  ) {
    const table = cellEl.closest('table')
    if (table instanceof HTMLTableElement) {
      activeTable.value = table
      activeCell.value = cellEl
      showTableTools.value = true
      placeTableTools()
      return
    }
  }
  if (!restricted.value) {
    const region = target?.closest?.('.edit-region')
    if (region instanceof HTMLElement && editorRef.value?.contains(region)) {
      currentRegion.value?.classList.remove('selected')
      currentRegion.value = region
      region.classList.add('selected')
      hideTableTools()
      return
    }
    currentRegion.value?.classList.remove('selected')
    currentRegion.value = null
  }
  hideTableTools()
}

function applyFieldDate(d: Date): void {
  const fmt = dateFormat.value
  const auto = autoUpdate.value
  const field = editingField.value
  if (field) {
    field.dataset.format = fmt
    field.dataset.auto = auto ? '1' : '0'
    field.dataset.block = fieldBlock.value ? '1' : '0'
    setFieldLabel(field, formatDateWith(fmt, auto ? new Date() : d))
  } else {
    const editor = editorRef.value
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    const range =
      savedRange && editor.contains(savedRange.startContainer) ? savedRange : null
    savedRange = null
    sel?.removeAllRanges()
    if (range) sel?.addRange(range)
    const node = buildDateField(auto ? new Date() : d, fmt, fieldBlock.value)
    if (range) range.insertNode(node)
    else editor.appendChild(node)
    const after = document.createTextNode('\u00A0')
    node.after(after)
    const caret = document.createRange()
    caret.setStartAfter(after)
    caret.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(caret)
  }
  closeFieldPicker()
  sync()
}

function deleteField(): void {
  editingField.value?.remove()
  closeFieldPicker()
  sync()
}

function adjacentDateField(range: Range, dir: 'prev' | 'next'): HTMLElement | null {
  let container: Node = range.startContainer
  let offset = range.startOffset
  if (container.nodeType === Node.TEXT_NODE) {
    const len = (container.textContent ?? '').length
    if (dir === 'prev' && offset > 0) return null
    if (dir === 'next' && offset < len) return null
  }
  for (;;) {
    if (container.nodeType === Node.ELEMENT_NODE) {
      const sibling =
        dir === 'prev'
          ? offset > 0
            ? container.childNodes[offset - 1]
            : undefined
          : offset < container.childNodes.length
            ? container.childNodes[offset]
            : undefined
      if (sibling instanceof HTMLElement && sibling.classList.contains('date-field')) return sibling
      if (sibling) return null
    }
    const parent = container.parentNode
    if (!parent || !(parent instanceof HTMLElement) || parent === editorRef.value) return null
    offset = Array.prototype.indexOf.call(parent.childNodes, container)
    container = parent
  }
}

function toggleRestricted(): void {
  restricted.value = !restricted.value
  if (restricted.value) {
    hideTableTools()
    closeFieldPicker()
    currentRegion.value?.classList.remove('selected')
    currentRegion.value = null
  }
}

function addEditRegion(): void {
  const editor = editorRef.value
  if (!editor || restricted.value) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
    error.value = '请先在文档中选中要开放编辑的文字'
    return
  }
  const range = sel.getRangeAt(0)
  const common = range.commonAncestorContainer
  const commonEl =
    common.nodeType === Node.ELEMENT_NODE ? (common as Element) : common.parentElement
  if (commonEl?.closest('table') || commonEl?.querySelector('table, .edit-region')) {
    error.value = '选区包含表格或已有可编辑区域，无法添加'
    return
  }
  const region = document.createElement('span')
  region.className = 'edit-region'
  region.contentEditable = 'true'
  region.title = '可编辑区域'
  try {
    if (range.collapsed) {
      region.textContent = '\u200B'
      range.insertNode(region)
      const caret = document.createRange()
      caret.selectNodeContents(region)
      caret.collapse(false)
      sel.removeAllRanges()
      sel.addRange(caret)
    } else {
      region.appendChild(range.extractContents())
      range.insertNode(region)
      const after = document.createRange()
      after.selectNodeContents(region)
      sel.removeAllRanges()
      sel.addRange(after)
    }
  } catch {
    error.value = '当前选区无法转换为可编辑区域'
    return
  }
  error.value = ''
  sync()
}

function removeEditRegion(): void {
  const region = currentRegion.value
  if (!region || restricted.value) return
  const parent = region.parentNode
  if (!parent) return
  if (region.classList.contains('blank')) {
    region.remove()
  } else {
    while (region.firstChild) parent.insertBefore(region.firstChild, region)
    region.remove()
  }
  currentRegion.value = null
  sync()
}

function makeBlank(widthPx: number, chars: number): HTMLElement {
  const span = document.createElement('span')
  span.className = 'edit-region blank'
  span.contentEditable = 'true'
  span.title = '填空处'
  span.dataset.w = String(chars)
  span.style.minWidth = `${widthPx}px`
  span.textContent = '\u200B'
  return span
}

const BLANK_TEST = /_{3,}/
const BLANK_PATTERN = /_{3,}/g

function enhanceImportedBlanks(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('.edit-region, .date-field') || !BLANK_TEST.test(node.textContent ?? '')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text)
  for (const textNode of targets) {
    const text = textNode.textContent ?? ''
    const frag = document.createDocumentFragment()
    let last = 0
    BLANK_PATTERN.lastIndex = 0
    for (let m = BLANK_PATTERN.exec(text); m; m = BLANK_PATTERN.exec(text)) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      const chars = m[0].length
      frag.append(makeBlank(Math.min(chars * 9, 360), Math.min(chars, 40)))
      last = m.index + chars
    }
    if (last < text.length) frag.append(text.slice(last))
    textNode.replaceWith(frag)
  }
}

function insertBlank(): void {
  const editor = editorRef.value
  if (!editor || restricted.value) return
  editor.focus()
  const sel = window.getSelection()
  const range = sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode) ? sel.getRangeAt(0) : null
  if (!range) {
    error.value = '请先点击文档中要插入填空的位置'
    return
  }
  const blank = makeBlank(120, 8)
  range.deleteContents()
  range.insertNode(blank)
  blank.after(document.createTextNode('\u00A0'))
  const caret = document.createRange()
  caret.selectNodeContents(blank)
  caret.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(caret)
  error.value = ''
  sync()
}

function convertUnderscores(): void {
  const editor = editorRef.value
  if (!editor || restricted.value) return
  const has = /_{3,}/
  const pattern = /_{3,}/g
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const p = node.parentElement
      if (!p || p.closest('.date-field, .edit-region, table')) return NodeFilter.FILTER_REJECT
      return has.test(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text)
  if (!targets.length) {
    error.value = '未找到可转换的下划线（至少 3 个连续 _）'
    return
  }
  for (const node of targets) {
    const text = node.textContent ?? ''
    const frag = document.createDocumentFragment()
    let last = 0
    pattern.lastIndex = 0
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      const chars = m[0].length
      frag.append(makeBlank(Math.min(chars * 9, 360), Math.min(chars, 40)))
      last = m.index + chars
    }
    if (last < text.length) frag.append(text.slice(last))
    node.replaceWith(frag)
  }
  error.value = ''
  sync()
}

function onEditorKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return
  const editor = editorRef.value
  if (!editor || !editor.contains(sel.anchorNode)) return
  const field = adjacentDateField(sel.getRangeAt(0), e.key === 'Backspace' ? 'prev' : 'next')
  if (!field) return
  if (restricted.value && !field.closest('.edit-region')) return
  e.preventDefault()
  const parent = field.parentNode
  const index = parent ? Array.prototype.indexOf.call(parent.childNodes, field) : 0
  field.remove()
  editor.focus()
  const sel2 = window.getSelection()
  const range = document.createRange()
  if (parent) range.setStart(parent, Math.min(index, parent.childNodes.length))
  range.collapse(true)
  sel2?.removeAllRanges()
  sel2?.addRange(range)
  sync()
}

function refreshAutoFields(): void {
  if (!editorRef.value) return
  const fields = editorRef.value.querySelectorAll<HTMLElement>('.date-field[data-auto="1"]')
  for (const field of Array.from(fields)) {
    setFieldLabel(field, formatDateWith(field.dataset.format ?? 'dash', new Date()))
  }
}

async function importDocx(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  error.value = ''
  try {
    const arrayBuffer = await file.arrayBuffer()
    const mammoth = (await import('mammoth/mammoth.browser')).default
    const result = await mammoth.convertToHtml({ arrayBuffer })
    if (editorRef.value) {
      editorRef.value.innerHTML = result.value
      enhanceImportedDates(editorRef.value)
      enhanceImportedBlanks(editorRef.value)
      sync()
    }
    fileName.value = file.name.replace(/\.docx$/i, '') || 'document'
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function exportDocx(): Promise<void> {
  exporting.value = true
  error.value = ''
  try {
    refreshAutoFields()
    const { htmlToDocx } = await import('@/utils/htmlToDocx')
    const blob = await htmlToDocx(currentHtml())
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName.value || 'document'}.docx`
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div ref="host" class="word-editor">
    <div class="toolbar">
      <input ref="file" type="file" accept=".docx" hidden @change="importDocx" />
      <button type="button" class="btn" :disabled="importing" @click="fileRef?.click()">
        {{ importing ? '导入中…' : '导入 .docx' }}
      </button>
      <button type="button" class="btn primary" :disabled="exporting" @click="exportDocx">
        {{ exporting ? '导出中…' : '导出 .docx' }}
      </button>

      <span class="sep" />
      <button type="button" class="btn" title="撤销" @mousedown.prevent @click="exec('undo')">撤销</button>
      <button type="button" class="btn" title="重做" @mousedown.prevent @click="exec('redo')">重做</button>

      <span class="sep" />
      <select title="段落格式" @change="onFormatBlock">
        <option value="p">正文</option>
        <option value="h1">标题 1</option>
        <option value="h2">标题 2</option>
        <option value="h3">标题 3</option>
      </select>
      <select title="字号" @change="onFontSize">
        <option value="2">小</option>
        <option value="3">标准</option>
        <option value="5">大</option>
        <option value="6">特大</option>
        <option value="7">最大</option>
      </select>
      <label class="color-label" title="文字颜色">
        颜色
        <input type="color" @change="onColor" />
      </label>

      <span class="sep" />
      <button type="button" class="btn" title="加粗" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
      <button type="button" class="btn" title="斜体" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
      <button type="button" class="btn" title="下划线" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
      <button type="button" class="btn" title="删除线" @mousedown.prevent @click="exec('strikeThrough')"><s>S</s></button>

      <span class="sep" />
      <button type="button" class="btn" title="无序列表" @mousedown.prevent @click="exec('insertUnorderedList')">• 列表</button>
      <button type="button" class="btn" title="有序列表" @mousedown.prevent @click="exec('insertOrderedList')">1. 列表</button>
      <button type="button" class="btn" title="左对齐" @mousedown.prevent @click="exec('justifyLeft')">左</button>
      <button type="button" class="btn" title="居中" @mousedown.prevent @click="exec('justifyCenter')">中</button>
      <button type="button" class="btn" title="右对齐" @mousedown.prevent @click="exec('justifyRight')">右</button>
      <button type="button" class="btn" title="两端对齐" @mousedown.prevent @click="exec('justifyFull')">两端</button>

      <span class="sep" />
      <button type="button" class="btn" title="插入表格" :disabled="restricted" @mousedown.prevent @click="insertTable">表格</button>
      <button type="button" class="btn" title="插入分隔线" :disabled="restricted" @mousedown.prevent @click="exec('insertHorizontalRule')">分隔线</button>
      <div ref="pickerAnchor" class="picker-anchor">
        <button type="button" class="btn" title="插入日期" :disabled="restricted" @mousedown.prevent @click="togglePicker">日期</button>
        <div v-if="showDatePicker" class="picker">
          <div class="picker-head">
            <button type="button" class="mini" title="上个月" @mousedown.prevent @click="shiftMonth(-1)">‹</button>
            <span class="picker-title">{{ pickerYear }}年 {{ pickerMonth + 1 }}月</span>
            <button type="button" class="mini" title="下个月" @mousedown.prevent @click="shiftMonth(1)">›</button>
          </div>
          <div class="picker-grid">
            <span v-for="w in weekdays" :key="w" class="week">{{ w }}</span>
            <button
              v-for="(cell, i) in dayCells"
              :key="i"
              type="button"
              class="day"
              :class="{ dim: !cell.inMonth, today: cell.isToday }"
              :title="formatDate(cell.date)"
              @mousedown.prevent
              @click="insertDate(cell.date)"
            >
              {{ cell.date.getDate() }}
            </button>
          </div>
          <div class="picker-foot">
            <select v-model="dateFormat" title="日期格式" @mousedown.stop>
              <option value="dash">2026-08-25</option>
              <option value="slash">2026/08/25</option>
              <option value="cn">2026年8月25日</option>
            </select>
            <button type="button" class="mini today-btn" @mousedown.prevent @click="insertDate(new Date())">今天</button>
          </div>
        </div>
      </div>
      <button type="button" class="btn field-btn" title="在光标处插入日期组件" :disabled="restricted" @mousedown.prevent @click="openFieldPickerFromButton">日期组件</button>
      <button type="button" class="btn" title="清除格式" @mousedown.prevent @click="exec('removeFormat')">清除格式</button>

      <span class="sep" />
      <label class="color-label" title="开启后仅可编辑标记为可编辑的区域，其余内容锁定">
        <input type="checkbox" :checked="restricted" @change="toggleRestricted" />
        限制编辑
      </label>
      <button type="button" class="btn" title="在光标处插入可填写的下划线空位" :disabled="restricted" @mousedown.prevent @click="insertBlank">插入填空</button>
      <button type="button" class="btn" title="将文档中连续下划线 ___ 批量转换为可填写空位" :disabled="restricted" @mousedown.prevent @click="convertUnderscores">_转填空</button>
      <button type="button" class="btn" title="将选中文字设为可编辑区域" :disabled="restricted" @mousedown.prevent @click="addEditRegion">＋可编辑区</button>
      <button type="button" class="btn" title="移除点击选中的可编辑区域" :disabled="restricted || !currentRegion" @mousedown.prevent @click="removeEditRegion">－可编辑区</button>
    </div>

    <div
      ref="editor"
      class="page"
      :class="{ restricted }"
      :contenteditable="restricted ? 'false' : 'true'"
      spellcheck="false"
      @input="sync"
      @click="onEditorClick"
      @keydown="onEditorKeydown"
    ></div>

    <div class="status">
      <span>字数：{{ wordCount }}</span>
      <span v-if="error" class="error">{{ error }}</span>
    </div>

    <div
      v-if="showFieldPicker"
      ref="fieldPicker"
      class="field-picker"
      :style="{ left: fieldPickerX + 'px', top: fieldPickerY + 'px' }"
    >
      <div class="picker-head">
        <button type="button" class="mini" title="上个月" @mousedown.prevent @click="shiftMonth(-1)">‹</button>
        <span class="picker-title">{{ pickerYear }}年 {{ pickerMonth + 1 }}月</span>
        <button type="button" class="mini" title="下个月" @mousedown.prevent @click="shiftMonth(1)">›</button>
      </div>
      <div class="picker-grid">
        <span v-for="w in weekdays" :key="w" class="week">{{ w }}</span>
        <button
          v-for="(cell, i) in dayCells"
          :key="i"
          type="button"
          class="day"
          :class="{ dim: !cell.inMonth, today: cell.isToday }"
          :title="formatDate(cell.date)"
          @mousedown.prevent
          @click="applyFieldDate(cell.date)"
        >
          {{ cell.date.getDate() }}
        </button>
      </div>
      <div class="picker-foot">
        <select v-model="dateFormat" title="日期格式" @mousedown.stop>
          <option value="dash">xxxx-xx-xx</option>
          <option value="slash">xxxx/xx/xx</option>
          <option value="cn">xxxx年xx月xx日</option>
        </select>
        <!--         <label class="auto-label" title="打开或导出文档时自动显示当天日期">
          <input v-model="autoUpdate" type="checkbox" />
          自动更新
        </label>
        <label class="auto-label" title="日期组件独占一行，不与正文同行">
          <input v-model="fieldBlock" type="checkbox" />
          独占一行
        </label> -->
        <button type="button" class="mini" @mousedown.prevent @click="applyFieldDate(new Date())">今天</button>
        <button v-if="editingField" type="button" class="mini del-btn" @mousedown.prevent @click="deleteField">删除</button>
      </div>
    </div>

    <div
      v-if="showTableTools"
      class="table-tools"
      :style="{ left: tableToolsX + 'px', top: tableToolsY + 'px' }"
    >
      <button type="button" class="tbtn" title="上方插入行" @mousedown.prevent @click="rowOp('above')">＋行↑</button>
      <button type="button" class="tbtn" title="下方插入行" @mousedown.prevent @click="rowOp('below')">＋行↓</button>
      <span class="tsep" />
      <button type="button" class="tbtn" title="左侧插入列" @mousedown.prevent @click="colOp('left')">＋列←</button>
      <button type="button" class="tbtn" title="右侧插入列" @mousedown.prevent @click="colOp('right')">＋列→</button>
      <span class="tsep" />
      <button type="button" class="tbtn" title="删除当前行" @mousedown.prevent @click="deleteRow">－行</button>
      <button type="button" class="tbtn" title="删除当前列" @mousedown.prevent @click="deleteCol">－列</button>
      <span class="tsep" />
      <button type="button" class="tbtn danger" title="删除整个表格" @mousedown.prevent @click="deleteTable">删表</button>
    </div>

    <div
      v-if="showTableTools"
      class="table-add"
      title="在末尾添加一行"
      :style="{ left: addBtnX + 'px', top: addBtnY + 'px' }"
      @mousedown.prevent
      @click="rowOp('end')"
    >
      ＋
    </div>
  </div>
</template>

<style scoped>
.word-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #f7f8fa;
  border: 1px solid #e3e5e8;
  border-radius: 8px;
}

.btn {
  padding: 4px 10px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d0d3d8;
  border-radius: 6px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: #eef0f3;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn.primary {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
}

.btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.sep {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: #d9dbe0;
}

.picker-anchor {
  position: relative;
}

.picker {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: 238px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e3e5e8;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.picker-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
}

.mini {
  padding: 2px 8px;
  font-size: 12px;
  color: #374151;
  background: #fff;
  border: 1px solid #d0d3d8;
  border-radius: 6px;
  cursor: pointer;
}

.mini:hover {
  background: #eef0f3;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.week {
  padding: 2px 0;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.day {
  padding: 0;
  font-size: 12px;
  line-height: 26px;
  color: #1f2328;
  text-align: center;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.day:hover {
  background: #e8f0fe;
}

.day.dim {
  color: #c2c6cc;
}

.day.today {
  font-weight: 600;
  color: #2563eb;
  background: #eff4ff;
}

.picker-foot {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f1f3;
}

.picker-foot select {
  font-size: 12px;
}

.today-btn {
  color: #2563eb;
  border-color: #bfdbfe;
}

.field-picker {
  position: absolute;
  z-index: 30;
  width: 238px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e3e5e8;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
}

.auto-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
  cursor: pointer;
}

.del-btn {
  color: #dc2626;
  border-color: #f3c1c1;
}

.del-btn:hover {
  background: #fef2f2;
}

.page :deep(.date-field) {
  display: inline-block;
  padding: 0 6px;
  margin: 0 2px;
  font: inherit;
  line-height: 1.5;
  color: #1d4ed8;
  background: #e8f0fe;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
}

.page :deep(.date-field[data-block='1']) {
  display: block;
  width: fit-content;
  margin: 6px 0;
  white-space: nowrap;
}

.page :deep(.field-icon) {
  margin-right: 3px;
  vertical-align: -1px;
}

.page :deep(.date-field:hover) {
  background: #dbe9fd;
}

.page :deep(.date-field.active) {
  outline: 2px solid #2563eb;
}

.page.restricted :deep(.edit-region) {
  padding: 0 2px;
  background: #fef9c3;
  box-shadow: inset 0 0 0 1px #fde047;
  border-radius: 3px;
}

.page:not(.restricted) :deep(.edit-region) {
  outline: 1px dashed #f59e0b;
  outline-offset: 2px;
  cursor: text;
}

.page:not(.restricted) :deep(.edit-region.selected) {
  outline: 2px solid #f59e0b;
  background: #fffbeb;
}

.page :deep(.edit-region.blank) {
  display: inline-block;
  min-height: 1.15em;
  padding: 0 4px;
  vertical-align: baseline;
  border-bottom: 1.5px solid #6b7280;
  outline: none;
}

.page:not(.restricted) :deep(.edit-region.blank) {
  outline: 1px dashed #f59e0b;
  outline-offset: 2px;
}

.page.restricted :deep(.edit-region.blank) {
  min-width: 80px;
  box-shadow: none;
  border-bottom-color: #d97706;
}

.table-tools {
  position: absolute;
  z-index: 30;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px;
  background: #fff;
  border: 1px solid #e3e5e8;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
}

.tbtn {
  padding: 3px 8px;
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
  background: #fff;
  border: 1px solid #d0d3d8;
  border-radius: 6px;
  cursor: pointer;
}

.tbtn:hover {
  background: #eef0f3;
}

.tbtn.danger {
  color: #dc2626;
  border-color: #f3c1c1;
}

.tbtn.danger:hover {
  background: #fef2f2;
}

.tsep {
  width: 1px;
  height: 16px;
  background: #e5e7eb;
}

.table-add {
  position: absolute;
  z-index: 29;
  width: 24px;
  height: 24px;
  font-size: 14px;
  line-height: 22px;
  color: #2563eb;
  text-align: center;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  user-select: none;
}

.table-add:hover {
  background: #e8f0fe;
}

select {
  padding: 3px 6px;
  font-size: 13px;
  background: #fff;
  border: 1px solid #d0d3d8;
  border-radius: 6px;
}

.color-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #374151;
}

.color-label input {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #d0d3d8;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.page {
  width: 100%;
  max-width: 800px;
  min-height: 640px;
  margin: 0 auto;
  padding: 56px 64px;
  font-family: 'Times New Roman', 'SimSun', serif;
  font-size: 16px;
  line-height: 1.8;
  color: #1f2328;
  background: #fff;
  border: 1px solid #e3e5e8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  outline: none;
  overflow-y: auto;
}

.page:focus {
  border-color: #2563eb;
}

.page :deep(h1) {
  margin: 0.8em 0 0.4em;
  font-size: 26px;
}

.page :deep(h2) {
  margin: 0.8em 0 0.4em;
  font-size: 22px;
}

.page :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-size: 19px;
}

.page :deep(p) {
  margin: 0.5em 0;
}

.page :deep(ul),
.page :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

.page :deep(blockquote) {
  margin: 0.5em 0;
  padding-left: 1em;
  color: #6b7280;
  border-left: 3px solid #d1d5db;
}

.page :deep(a) {
  color: #2563eb;
}

.page :deep(img) {
  max-width: 100%;
}

.page :deep(table) {
  width: 100%;
  margin: 0.5em 0;
  border-collapse: collapse;
}

.page :deep(td),
.page :deep(th) {
  padding: 6px 8px;
  border: 1px solid #bbb;
}

.page :deep(hr) {
  margin: 1em 0;
  border: none;
  border-top: 1px solid #d1d5db;
}

.status {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  font-size: 12px;
  color: #6b7280;
}

.error {
  color: #dc2626;
}
</style>
