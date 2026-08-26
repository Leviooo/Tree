import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx'

type DocxInline = TextRun | ImageRun | ExternalHyperlink
type DocxBlock = Paragraph | Table
type HeadingValue = (typeof HeadingLevel)[keyof typeof HeadingLevel]
type AlignValue = (typeof AlignmentType)[keyof typeof AlignmentType]

interface RunStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  link?: string
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
}

const orderedNumbering = {
  reference: 'ordered-list',
  levels: [
    { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
    { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.START },
    { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.START },
    { level: 3, format: LevelFormat.DECIMAL, text: '%4.', alignment: AlignmentType.START },
  ],
}

function readAlignment(el: Element): AlignValue | undefined {
  const align = (el as HTMLElement).style?.textAlign
  if (align === 'center') return AlignmentType.CENTER
  if (align === 'right') return AlignmentType.RIGHT
  if (align === 'justify') return AlignmentType.JUSTIFIED
  return undefined
}

function runOptions(style: RunStyle) {
  return {
    bold: style.bold || undefined,
    italics: style.italics || undefined,
    strike: style.strike || undefined,
    underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
  }
}

function buildImage(el: Element): ImageRun | null {
  const src = el.getAttribute('src') ?? ''
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,([A-Za-z0-9+/=]+)$/.exec(src)
  if (!match) return null
  const raw = match[1] ?? 'png'
  const kind: 'png' | 'jpg' | 'gif' | 'bmp' =
    raw === 'png' ? 'png' : raw === 'gif' ? 'gif' : raw === 'bmp' ? 'bmp' : 'jpg'
  const binary = atob(match[2] ?? '')
  const data = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  const width = Number.parseInt(el.getAttribute('width') ?? '', 10) || 420
  const height = Number.parseInt(el.getAttribute('height') ?? '', 10) || 315
  return new ImageRun({ type: kind, data, transformation: { width, height } })
}

function parseInline(node: Node, style: RunStyle, out: DocxInline[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return
    if (style.link) {
      out.push(
        new ExternalHyperlink({
          link: style.link,
          children: [new TextRun({ text, ...runOptions(style) })],
        }),
      )
    } else {
      out.push(new TextRun({ text, ...runOptions(style) }))
    }
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (
    tag === 'span' &&
    el.classList.contains('edit-region') &&
    el.classList.contains('blank') &&
    !(el.textContent ?? '').replace(/[\u200B ]/g, '').trim()
  ) {
    const w = Math.min(Math.max(Number.parseInt(el.getAttribute('data-w') ?? '8', 10) || 8, 3), 40)
    out.push(new TextRun({ text: '_'.repeat(w) }))
    return
  }
  if (tag === 'br') {
    out.push(new TextRun({ text: '', break: 1 }))
    return
  }
  if (tag === 'img') {
    const image = buildImage(el as HTMLElement)
    if (image) out.push(image)
    return
  }
  const next: RunStyle = { ...style }
  if (tag === 'b' || tag === 'strong') next.bold = true
  else if (tag === 'i' || tag === 'em') next.italics = true
  else if (tag === 'u') next.underline = true
  else if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true
  else if (tag === 'a') next.link = el.getAttribute('href') ?? style.link
  for (const child of Array.from(el.childNodes)) parseInline(child, next, out)
}

function headingFor(tag: string): HeadingValue | undefined {
  switch (tag) {
    case 'h1': return HeadingLevel.HEADING_1
    case 'h2': return HeadingLevel.HEADING_2
    case 'h3': return HeadingLevel.HEADING_3
    case 'h4': return HeadingLevel.HEADING_4
    case 'h5': return HeadingLevel.HEADING_5
    case 'h6': return HeadingLevel.HEADING_6
    default: return undefined
  }
}

function buildParagraph(el: Element, heading?: HeadingValue): Paragraph {
  const inlines: DocxInline[] = []
  for (const child of Array.from(el.childNodes)) parseInline(child, {}, inlines)
  return new Paragraph({
    children: inlines.length ? inlines : [new TextRun('')],
    heading,
    alignment: readAlignment(el),
  })
}

function isListElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  return tag === 'ul' || tag === 'ol'
}

function appendList(el: Element, ordered: boolean, level: number, out: DocxBlock[]): void {
  const lvl = Math.min(level, 3)
  for (const li of Array.from(el.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue
    const inlines: DocxInline[] = []
    const nested: Element[] = []
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && isListElement(child as Element)) {
        nested.push(child as Element)
      } else {
        parseInline(child, {}, inlines)
      }
    }
    out.push(
      new Paragraph({
        children: inlines.length ? inlines : [new TextRun('')],
        ...(ordered
          ? { numbering: { reference: 'ordered-list', level: lvl } }
          : { bullet: { level: lvl } }),
      }),
    )
    for (const sub of nested) {
      appendList(sub, sub.tagName.toLowerCase() === 'ol', level + 1, out)
    }
  }
}

function buildTable(el: Element): Table | null {
  const rows: TableRow[] = []
  const trList = el.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr')
  for (const tr of Array.from(trList)) {
    const cells: TableCell[] = []
    for (const cellEl of Array.from(tr.children)) {
      const tag = cellEl.tagName.toLowerCase()
      if (tag !== 'td' && tag !== 'th') continue
      const blocks: DocxBlock[] = []
      appendBlocks(Array.from(cellEl.childNodes), blocks)
      const span = Number.parseInt(cellEl.getAttribute('colspan') ?? '', 10)
      cells.push(
        new TableCell({
          children: blocks.length ? blocks : [new Paragraph('')],
          ...(Number.isNaN(span) ? {} : { columnSpan: span }),
        }),
      )
    }
    if (cells.length) rows.push(new TableRow({ children: cells }))
  }
  if (!rows.length) return null
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  })
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
])

function isBlockNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as HTMLElement
  if (el.classList.contains('date-field') && el.getAttribute('data-block') === '1') return true
  return BLOCK_TAGS.has(el.tagName.toLowerCase())
}

function buildHorizontalRule(): Paragraph {
  return new Paragraph({
    children: [],
    spacing: { before: 120, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 },
    },
  })
}

function appendBlocks(nodes: Node[], out: DocxBlock[]): void {
  let inlineBuf: Node[] = []
  const flushInline = (): void => {
    if (!inlineBuf.length) return
    const inlines: DocxInline[] = []
    for (const n of inlineBuf) parseInline(n, {}, inlines)
    if (inlines.length) out.push(new Paragraph({ children: inlines }))
    inlineBuf = []
  }
  for (const node of nodes) {
    if (isBlockNode(node)) {
      flushInline()
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()
      if (headingFor(tag)) {
        out.push(buildParagraph(el, headingFor(tag)))
      } else if (tag === 'ul') {
        appendList(el, false, 0, out)
      } else if (tag === 'ol') {
        appendList(el, true, 0, out)
      } else if (tag === 'table') {
        const table = buildTable(el)
        if (table) out.push(table)
      } else if (tag === 'hr') {
        out.push(buildHorizontalRule())
      } else if (el.classList.contains('date-field')) {
        out.push(buildParagraph(el))
      } else {
        appendBlocks(Array.from(el.childNodes), out)
      }
      continue
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const meaningful = text.trim().length > 0 || text.includes(' ')
      if (!meaningful) continue
      if (!inlineBuf.length && !text.trim()) continue
    }
    inlineBuf.push(node)
  }
  flushInline()
}

export async function htmlToDocx(html: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const blocks: DocxBlock[] = []
  appendBlocks(Array.from(parsed.body.childNodes), blocks)
  const file = new Document({
    numbering: { config: [orderedNumbering] },
    sections: [{ children: blocks.length ? blocks : [new Paragraph('')] }],
  })
  return Packer.toBlob(file)
}
