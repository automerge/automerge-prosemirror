import {unstable, InsertPatch, DelPatch, Patch, type Prop} from "@automerge/automerge";
import {Fragment, Slice, Mark} from "prosemirror-model";
import {Transaction} from "prosemirror-state";
import { schema } from "prosemirror-schema-basic";

type MarkPatch = {
  action: 'mark'
  path: Prop[],
  marks: unstable.Mark[]
}

export default function(patches: Array<Patch>, path: Prop[], tx: Transaction){
  for (const patch of patches) {
    if (patch.action === "insert") {
      handleInsert(patch, path, tx)
    } else if (patch.action === "del") {
      handleDelete(patch, path, tx)
    } else if (patch.action === "mark") {
      handleMark(patch, path, tx)
    }
  }
}

function handleInsert(patch: InsertPatch, path: Prop[], tx: Transaction) {
  let index = charPath(path, patch.path)
  if (index === null) return
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, "\n\n")
  const pmIdx = amIdxToPmIdx(index, pmText)
  tx.replace(pmIdx, pmIdx, new Slice(Fragment.from(schema.text(patch.values.join(""))), 0, 0))
}

function handleDelete(patch: DelPatch, path: Prop[], tx: Transaction) {
  let index = charPath(path, patch.path)
  if (index === null) return
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, "\n\n")
  const pmIdx = amIdxToPmIdx(index, pmText)
  tx.delete(pmIdx, pmIdx + (patch.length || 1))
}

function handleMark(patch: MarkPatch, path: Prop[], tx: Transaction) {
  if (pathEquals(patch.path, path)) {
    for (const mark of patch.marks) {
      let pmText = tx.doc.textBetween(0, tx.doc.content.size, "\n\n")
      const pmStart = amIdxToPmIdx(mark.start, pmText)
      const pmEnd = amIdxToPmIdx(mark.end, pmText)
      tx.addMark(pmStart, pmEnd, schema.marks[mark.name].create({}))
    }
  }
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

function amIdxToPmIdx(amIdx: number, pmText: string): number {
  // start at one because that's the index of the first character of the first paragraph
  let pmIdx = 1
  for (let i = 0; i < amIdx; i++) {
    if (pmText[i] === "\n" && pmText[i+1] == "\n") {
      i++
    }
    pmIdx++
  }
  return pmIdx
}
