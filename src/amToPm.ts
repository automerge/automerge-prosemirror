import {unstable, InsertPatch, DelPatch, Patch, type Prop, SpliceTextPatch} from "@automerge/automerge";
import {Fragment, Slice, Mark} from "prosemirror-model";
import {Transaction} from "prosemirror-state";
import {schema} from "prosemirror-schema-basic";

const BLOCK_MARKER = "\n"

type MarkPatch = {
  action: 'mark'
  path: Prop[],
  marks: unstable.Mark[]
}

export default function (patches: Array<Patch>, path: Prop[], tx: Transaction): Transaction {
  for (const patch of patches) {
    if (patch.action === "insert") {
      tx = handleInsert(patch, path, tx)
    } else if (patch.action === "splice") {
      tx = handleSplice(patch, path, tx)
    } else if (patch.action === "del") {
      tx = handleDelete(patch, path, tx)
    } else if (patch.action === "mark") {
      tx = handleMark(patch, path, tx)
    }
  }
  return tx
}

function handleInsert(patch: InsertPatch, path: Prop[], tx: Transaction): Transaction {
  let index = charPath(path, patch.path)
  if (index === null) return tx
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, BLOCK_MARKER)
  const pmIdx = amIdxToPmIdx(index, pmText)
  const content = patchContentToSlice(patch.values.join(""))
  return tx.replace(pmIdx, pmIdx, content)
}

function handleSplice(patch: SpliceTextPatch, path: Prop[], tx: Transaction): Transaction {
  let index = charPath(path, patch.path)
  if (index === null) return tx
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, BLOCK_MARKER)
  const idx = amIdxToPmIdx(index, pmText)
  return tx.replace(idx, idx, patchContentToSlice(patch.value))
}

function handleDelete(patch: DelPatch, path: Prop[], tx: Transaction): Transaction {
  let index = charPath(path, patch.path)
  if (index === null) return tx
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, BLOCK_MARKER)
  const start = amIdxToPmIdx(index, pmText)
  const end = amIdxToPmIdx(index + (patch.length || 1), pmText)
  return tx.delete(start, end)
}

function handleMark(patch: MarkPatch, path: Prop[], tx: Transaction) {
  if (pathEquals(patch.path, path)) {
    for (const mark of patch.marks) {
      let pmText = tx.doc.textBetween(0, tx.doc.content.size, BLOCK_MARKER)
      const pmStart = amIdxToPmIdx(mark.start, pmText)
      const pmEnd = amIdxToPmIdx(mark.end, pmText)
      tx = tx.addMark(pmStart, pmEnd, schema.marks[mark.name].create({}))
    }
  }
  return tx
}

// If the path of the patch is of the form [path, <index>] then we know this is
// a path to a character within the sequence given by path
function charPath(textPath: Prop[], candidatePath: Prop[]): number | null {
  if (candidatePath.length !== textPath.length + 1) return null
  for (let i = 0; i < textPath.length; i++) {
    if (textPath[i] !== candidatePath[i]) return null
  }
  const index = candidatePath[candidatePath.length - 1]
  if (typeof index === "number") return index
  return null
}

function pathEquals(path1: Prop[], path2: Prop[]): boolean {
  if (path1.length !== path2.length) return false
  for (let i = 0; i < path1.length; i++) {
    if (path1[i] !== path2[i]) return false
  }
  return true
}

function patchContentToSlice(patchContent: string): Slice {
  // * The incoming content starts with a newline. In this case we set openStart 
  //   to 0 to indicate a new paragraph
  // * The incoming content does not start with a newline, in which case we set
  //   openStart to 1 to indicate continuing a paragraph
  const startsWithNewline = patchContent[-1] === BLOCK_MARKER
  const openStart = startsWithNewline ? 0 : 1

  // * The incoming content ends with a newline, in which case we set openEnd to
  //   0 to indicate that the paragraph is closed
  // * The incoming content does not end with a newline, in which case we set
  //   openEnd to 1 to indicate that there coule be more paragraph afterwards
  const endsWithNewline = patchContent.length > 1 && patchContent[patchContent.length - 1] === BLOCK_MARKER
  const openEnd = endsWithNewline ? 0 : 1

  let content = Fragment.empty
  let blocks = patchContent.split(BLOCK_MARKER).map(b => {
    if (b.length == 0) {
      return schema.node("paragraph", null, [])
    } else {
      return schema.node("paragraph", null, [schema.text(b)])
    }
  })
  if (blocks.length > 0) {
    content = Fragment.from(blocks)
  }
  return new Slice(content, openStart, openEnd)
}

function amIdxToPmIdx(
  amIdx: number,
  amText: string
): number {
  // first, count how many paragraphs we have
  let idx = amText.indexOf(BLOCK_MARKER)
  let i = 0
  while (idx < amIdx && idx !== -1) {
    idx = amText.indexOf(BLOCK_MARKER, idx + 1)
    i++
  }

  // this is how many blocks precede the current one.
  // BtextBmore textBmo^re text after pos
  let automergeBlockCount = i

  // <p>text</p><p>more text</p><p>mo^re text after pos</p>
  let prosemirrorBlockCount = automergeBlockCount * 2

  let diff = prosemirrorBlockCount - automergeBlockCount
  return amIdx + diff + 1 // +1 for the opening paragraph tag
}
