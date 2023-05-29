import {InsertPatch, Patch, type Prop} from "@automerge/automerge";
import {Transaction} from "prosemirror-state";

export default function(patches: Array<Patch>, path: Prop[], tx: Transaction){
  for (const patch of patches) {
    console.log(patch.path)
  }
}

function handleInsert(patch: InsertPatch, path: Prop[], tx: Transaction) {
  let index = insertPath(path, patch.path)
  if (index === null) return

}

// If the path of the patch is of the form [path, <index>] then we know this is
// a patch inserting one or more characters into the text object
function insertPath(textPath: Prop[], candidatePath: Prop[]): number | null {
  if (candidatePath.length !== textPath.length + 1) return null
  for (let i = 0; i < textPath.length; i++) {
    if (textPath[i] !== candidatePath[i]) return null
  }
  const index = candidatePath[candidatePath.length - 1]
  if (typeof index === "number") return index
  return null
}
