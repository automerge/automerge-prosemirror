import { next as automerge } from "@automerge/automerge/slim"
import { EditorState, Transaction } from "prosemirror-state"
import amToPm from "./amToPm.js"
import { next as am } from "@automerge/automerge/slim"
import { SchemaAdapter } from "./schema.js"

export function patchesToTr<T>({
  adapter,
  path,
  before,
  after,
  patches,
  state,
}: {
  adapter: SchemaAdapter
  path: am.Prop[]
  before: am.Doc<T>
  after: am.Doc<T>
  patches: am.Patch[]
  state: EditorState
}): Transaction {
  const headsBefore = automerge.getHeads(before)
  const spans = automerge.spans(automerge.view(after, headsBefore), path)
  const tr = amToPm(adapter, spans, patches, path, state.tr)
  tr.setMeta("addToHistory", false) // remote changes should not be added to local stack
  return tr
}

export default patchesToTr
