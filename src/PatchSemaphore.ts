import { next as automerge } from "@automerge/automerge"
import { EditorState, Transaction } from "prosemirror-state"
import amToPm from "./amToPm"
import { intercept } from "./intercept"
import { getLastHeads, getPath, updateHeads } from "./plugin"
import { DocHandle } from "./DocHandle"
import { printTree } from "../test/utils"

type Doc<T> = automerge.Doc<T>
type Patch = automerge.Patch

export default class PatchSemaphore<T> {
  _inLocalTransaction = false

  intercept = (
    handle: DocHandle<T>,
    intercepted: Transaction,
    state: EditorState,
  ): EditorState => {
    this._inLocalTransaction = true
    const result = intercept(handle, intercepted, state)
    this._inLocalTransaction = false
    return result
  }

  reconcilePatch = (
    docBefore: Doc<T>,
    docAfter: Doc<T>,
    patches: Patch[],
    state: EditorState,
  ): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    console.log("reconciling")
    console.log(patches)
    const path = getPath(state)
    const headsBefore = automerge.getHeads(docBefore)
    const headsAfter = automerge.getHeads(docAfter)

    const spans = automerge.spans(automerge.view(docAfter, headsBefore), path)
    let tx = amToPm(state.schema, spans, patches, path, state.tr, false)
    tx = updateHeads(tx, headsAfter)
    return state.apply(tx)
  }
}
