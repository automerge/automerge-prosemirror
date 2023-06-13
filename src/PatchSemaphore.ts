import {unstable as automerge} from "@automerge/automerge";
import {EditorState, Transaction} from "prosemirror-state";
import amToPm from "./amToPm";
import {intercept} from "./intercept"
import {getPath, getMarks, updateHeads, getLastHeads} from "./plugin";

type Doc<T> = automerge.Doc<T>
type Heads = automerge.Heads
type Patch = automerge.Patch

type ChangeFn<T> = (doc: Doc<T>) => void

export default class PatchSemaphore<T> {
  _inLocalTransaction: boolean = false;

  intercept = (currentHeads: Heads, change: (_: ChangeFn<T>) => Doc<T>, intercepted: Transaction, state: EditorState): EditorState => {
    this._inLocalTransaction = true;
    const result = intercept(currentHeads, change, intercepted, state)
    this._inLocalTransaction = false;
    return result;
  }

  reconcilePatch = (docAfter: Doc<T>, patches: Patch[], state: EditorState): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    let path = getPath(state)
    let marksMap = getMarks<T>(state)
    let headsAfter = automerge.getHeads(docAfter)

    let headsBefore = getLastHeads(state)
    let docBefore = automerge.view(docAfter, headsBefore)

    let tx = amToPm(docBefore, docAfter, marksMap, patches, path, state.tr)
    tx = updateHeads(tx, headsAfter)
    return state.apply(tx)
  }
}
