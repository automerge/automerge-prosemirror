import {unstable, DelPatch, Patch, type Prop, Doc} from "@automerge/automerge";
import {Fragment, Slice, Mark, Attrs} from "prosemirror-model";
import {Transaction} from "prosemirror-state";
import {schema} from "prosemirror-schema-basic";
import {BLOCK_MARKER} from "./constants"
import {amIdxToPmIdx} from "./positions"
import {MarkValue} from "./marks";

type SpliceTextPatch = unstable.SpliceTextPatch
type InsertPatch = unstable.InsertPatch

type MarkSet = {
  [name: string]: MarkValue
}

type MarkPatch = {
  action: 'mark'
  path: Prop[],
  marks: unstable.Mark[]
}

type TranslateIdx = (idx: number) => number

export default function <T>(
  before: Doc<T>,
  patches: Array<Patch>,
  path: Prop[], tx: Transaction
): Transaction {
  let result = tx
  const patchState = new PatchingText(before, path)
  for (const patch of patches) {
    if (patch.action === "insert") {
      result = handleInsert(patch, path, result, patchState.translate)
    } else if (patch.action === "splice") {
      result = handleSplice(patch, path, result, patchState.translate)
    } else if (patch.action === "del") {
      result = handleDelete(patch, path, result, patchState.translate)
    } else if (patch.action === "mark") {
      result = handleMark(patch, path, result, patchState.translate)
    }
    patchState.patch(patch)
  }
  return result
}

function handleInsert(patch: InsertPatch, path: Prop[], tx: Transaction, translate: TranslateIdx): Transaction {
  const index = charPath(path, patch.path)
  if (index === null) return tx
  const pmIdx = translate(index)
  const content = patchContentToSlice(patch.values.join(""), patch.marks)
  return tx.replace(pmIdx, pmIdx, content)
}

function handleSplice(patch: SpliceTextPatch, path: Prop[], tx: Transaction, translate: TranslateIdx): Transaction {
  const index = charPath(path, patch.path)
  if (index === null) return tx
  const idx = translate(index)
  return tx.replace(idx, idx, patchContentToSlice(patch.value, patch.marks))
}

function handleDelete(patch: DelPatch, path: Prop[], tx: Transaction, translate: TranslateIdx): Transaction {
  const index = charPath(path, patch.path)
  if (index === null) return tx
  const start = translate(index)
  const end = translate(index + (patch.length || 1))
  return tx.delete(start, end)
}

function handleMark(patch: MarkPatch, path: Prop[], tx: Transaction, translate: TranslateIdx) {
  if (pathEquals(patch.path, path)) {
    for (const mark of patch.marks) {
      const pmStart = translate(mark.start)
      const pmEnd = translate(mark.end)
      const markType = schema.marks[mark.name]
      if (markType == null) continue
      if (mark.value == null) {
        tx = tx.removeMark(pmStart, pmEnd, markType)
      } else {
        const markAttrs = attrsFromMark(mark.value)
        tx = tx.addMark(pmStart, pmEnd, markType.create(markAttrs))
      }
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

function patchContentToSlice(patchContent: string, marks?: MarkSet): Slice {
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

  let pmMarks: Array<Mark> | undefined = undefined
  if (marks != null) {
    pmMarks = Object.entries(marks).reduce((acc: Mark[], [name, value]: [string, MarkValue]) => {
      // This should actually never be null because automerge only uses null 
      // as the value for a mark when a mark is being removed, which would only
      // happen in a `AddMark` patch, not a `Insert` or `Splice` patch. But we
      // appease typescript anyway
      if (value != null) {
        const markAttrs = attrsFromMark(value)
        acc.push(schema.mark(name, markAttrs))
      }
      return acc
    }, [])
  }

  let content = Fragment.empty
  const blocks = patchContent.split(BLOCK_MARKER).map(b => {
    if (b.length == 0) {
      return schema.node("paragraph", null, [])
    } else {
      return schema.node("paragraph", null, [schema.text(b, pmMarks)])
    }
  })
  if (blocks.length > 0) {
    content = Fragment.from(blocks)
  }
  return new Slice(content, openStart, openEnd)
}

class PatchingText {
  docPath: Prop[]
  currentValue: string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(doc: Doc<any>, path: Prop[]) {
    this.docPath = path
    let current = doc
    for (let i = 0; i < path.length; i++) {
      const prop = path[i]
      current = current[prop]
    }
    const amText = current.toString()
    this.currentValue = amText
  }

  patch = (patch: Patch): void => {
    if (patch.action === "splice") {
      const index = charPath(this.docPath, patch.path)
      if (index == null) {
        return
      }
      const before = this.currentValue.substring(0, index)
      const after = this.currentValue.substring(index + patch.value.length)
      this.currentValue = before + patch.value + after
    } else if (patch.action === "del") {
      const index = charPath(this.docPath, patch.path)
      if (index == null) {
        return
      }
      const before = this.currentValue.substring(0, index)
      const after = this.currentValue.substring(index + (patch.length || 1))
      this.currentValue = before + after
    } else if (patch.action === "insert") {
      const index = charPath(this.docPath, patch.path)
      if (index == null) {
        return
      }
      const before = this.currentValue.substring(0, index)
      const after = this.currentValue.substring(index)
      this.currentValue = before + patch.values.join("") + after
    }
  }

  translate = (index: number): number => {
    return amIdxToPmIdx(index, this.currentValue)
  }
}

function attrsFromMark(mark: MarkValue): Attrs | null {
  let markAttrs = null
  if (typeof mark === "string") {
    try {
      const markJson = JSON.parse(mark)
      if (typeof markJson === "object") {
        markAttrs = markJson as Attrs
      }
    } catch (e) {
      // ignore
    }
  }
  return markAttrs
}
