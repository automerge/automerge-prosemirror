import {Extend, Prop, Doc, Heads, Patch} from "@automerge/automerge"
import * as automerge from "@automerge/automerge"
import {EditorState} from "prosemirror-state"
import amToPm from "./amToPm"
import {getLastHeads, takeUnreconciledTxns, getPath, updateHeads} from "./plugin"
import pmToAm from "./pmToAm"

export type ChangeFn = (doc: Extend<any>) => void

export function reconcileProsemirror(state: EditorState, patches: Array<Patch>, headsAfter: Heads): EditorState {
  let path = getPath(state)
  let tx = state.tr
  amToPm(patches, path, tx)
  updateHeads(tx, headsAfter)
  return state.apply(tx)
}

export function reconcileAutomerge(state: EditorState, change: (_: ChangeFn) => Heads): EditorState {
  let [newState, txns] = takeUnreconciledTxns(state)
  let newHeads = change((doc) => {
    let path = getPath(state)
    let [subdoc, attr] = docAndAttr(doc, path)
    for (const tx of txns) {
      pmToAm(tx, subdoc, attr)
    }
  })
  let tx = updateHeads(newState.tr, newHeads)
  return newState.apply(tx)
}

function docAndAttr(doc: Extend<any>, path: Prop[]): [Extend<any>, Prop] {
  let result_path = path.slice()
  while (result_path.length > 1) {
    doc = doc[result_path.shift()!]
  }
  return [doc, path[0]]
}
