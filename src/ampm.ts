import {Extend, Patch, Prop, Doc} from "@automerge/automerge"
import {EditorState, Transaction} from "prosemirror-state"
import amToPm from "./amToPm"

const AM_TXN = "amTxn"

export function updateProsemirror(patches: Patch[], state: EditorState): EditorState {
  if 
  return state
}

export function updateAutomerge(doc: Extend<any>, path: Prop[], tx: Transaction): Doc<any> {
  if (!tx.getMeta(AM_TXN)) {
  }
  return doc
}
