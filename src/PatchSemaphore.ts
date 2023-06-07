import {Doc, Heads, Patch} from "@automerge/automerge";
import {EditorState, Transaction} from "prosemirror-state";
import amToPm from "./amToPm";
import {intercept} from "./intercept"
import {getPath, getMarks, updateHeads} from "./plugin";

type ChangeFn<T> = (doc: Doc<T>) => void

export default class PatchSemaphore<T> {
  _inLocalTransaction: boolean = false;

  intercept = (currentHeads: Heads, change: (_: ChangeFn<T>) => Doc<T>, intercepted: Transaction, state: EditorState): EditorState => {
    this._inLocalTransaction = true;
    const result = intercept(currentHeads, change, intercepted, state)
    this._inLocalTransaction = false;
    return result;
  }

  reconcilePatch = (docAfter: T, patches: Patch[], headsAfter: Heads, state: EditorState): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    let path = getPath(state)
    let marksMap = getMarks<T>(state)
    let tx = amToPm(docAfter, marksMap, patches, path, state.tr)
    tx = updateHeads(tx, headsAfter)
    return state.apply(tx)
  }
}
