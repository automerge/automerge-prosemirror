import {InsertPatch, DelPatch, Patch, type Prop} from "@automerge/automerge";
import {Fragment, Slice} from "prosemirror-model";
import {Transaction} from "prosemirror-state";
import { schema } from "prosemirror-schema-basic";

export default function(patches: Array<Patch>, path: Prop[], tx: Transaction){
  for (const patch of patches) {
    if (patch.action === "insert") {
      handleInsert(patch, path, tx)
    } else if (patch.action == "del") {
      handleDelete(patch, path, tx)
    }
  }
}

function handleInsert(patch: InsertPatch, path: Prop[], tx: Transaction) {
  let index = charPath(path, patch.path)
  if (index === null) return
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, "\n\n")
  const pmIdx = amIdxToPmIdx(index, pmText)
  // TODO: handle newlines in inserted text
  // TODO: handle non-character values
  tx.replace(pmIdx, pmIdx, new Slice(Fragment.from(schema.text(patch.values.join(""))), 0, 0))
}

function handleDelete(patch: DelPatch, path: Prop[], tx: Transaction) {
  let index = charPath(path, patch.path)
  if (index === null) return
  let pmText = tx.doc.textBetween(0, tx.doc.content.size, "\n\n")
  const pmIdx = amIdxToPmIdx(index, pmText)
  tx.delete(pmIdx, pmIdx + (patch.length || 1))
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
