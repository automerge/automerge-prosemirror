import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import * as automerge  from "@automerge/automerge";
import {Doc, Heads, Prop} from "@automerge/automerge";

// The name of the meta field that holds the last heads we reconciled with
const AM_PLUGIN: string = "automergePlugin"
const NEW_HEADS: string = "am_newHeads"
const RESET_UNRECONCILED: string = "am_resetUnreconciledTxns"

const pluginKey: PluginKey<State> = new PluginKey(AM_PLUGIN)


type State = {
  lastHeads: Heads
  path: Prop[]
  unreconciledTxns: Transaction[]
}

export default function(doc: Doc<any>, path: Prop[]): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init: () => ({ 
        lastHeads: automerge.getHeads(doc) ,
        path,
        unreconciledTxns: [],
      }),
      apply: (tr: Transaction, prev: State): State => {
        let newHeads: Heads = tr.getMeta(NEW_HEADS)
        if (newHeads) {
          return {
            ...prev,
            lastHeads: newHeads,
          }
        } else if (tr.getMeta(RESET_UNRECONCILED)) {
          return {
            ...prev,
            unreconciledTxns: [],
          }
        } else {
          return {
            ...prev,
            unreconciledTxns: prev.unreconciledTxns.concat(tr),
          }
        }
      }
    }
  })
}

export function getPath(state: EditorState): Prop[] {
  return pluginKey.getState(state)!.path
}

export function getLastHeads(state: EditorState): Heads {
  return pluginKey.getState(state)!.lastHeads
}

export function updateHeads(tr: Transaction, heads: Heads): Transaction {
  return tr.setMeta(NEW_HEADS, heads)
}

export function takeUnreconciledTxns(state: EditorState): [EditorState, Transaction[]] {
  let txns = pluginKey.getState(state)!.unreconciledTxns
  let tr = state.tr.setMeta(RESET_UNRECONCILED, true)
  return [state.apply(tr), txns]
}

