import {Doc, Heads, Patch} from "@automerge/automerge";
import {EditorState, Transaction} from "prosemirror-state";
import amToPm from "./amToPm";
import {intercept} from "./intercept"
import {getPath, updateHeads} from "./plugin";

type ChangeFn = (doc: Doc<any>) => void

export default class PatchSemaphore {
  _inLocalTransaction: boolean = false;

  intercept = (currentHeads: Heads, change: (_: ChangeFn) => Doc<any>, intercepted: Transaction, state: EditorState): EditorState => {
    this._inLocalTransaction = true;
    const result = intercept(currentHeads, change, intercepted, state)
    this._inLocalTransaction = false;
    return result;
  }

  reconcilePatch = (patches: Patch[], headsAfter: Heads, state: EditorState): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    let path = getPath(state)
    let tx = amToPm(patches, path, state.tr)
    tx = updateHeads(tx, headsAfter)
    return state.apply(tx)
  }
}
