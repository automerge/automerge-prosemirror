import { unstable as automerge } from "@automerge/automerge"
import { EditorState, Transaction } from "prosemirror-state"
import amToPm from "./amToPm"
import { intercept } from "./intercept"
import { getPath, updateHeads, getLastHeads } from "./plugin"

type Doc<T> = automerge.Doc<T>
type Heads = automerge.Heads
type Patch = automerge.Patch

type ChangeFn<T> = (doc: Doc<T>) => void

export default class PatchSemaphore<T> {
  _inLocalTransaction = false

  intercept = (
    change: (_atHeads: Heads, _doChange: ChangeFn<T>) => Doc<T>,
    intercepted: Transaction,
    state: EditorState
  ): EditorState => {
    this._inLocalTransaction = true
    const result = intercept(change, intercepted, state)
    this._inLocalTransaction = false
    return result
  }

  reconcilePatch = (
    docAfter: Doc<T>,
    patches: Patch[],
    state: EditorState
  ): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    const path = getPath(state)
    const headsAfter = automerge.getHeads(docAfter)

    const headsBefore = getLastHeads(state)
    const docBefore = automerge.view(docAfter, headsBefore)

    let tx = amToPm(docBefore, patches, path, state.tr)
    tx = updateHeads(tx, headsAfter)
    return state.apply(tx)
  }
}
