import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import * as automerge  from "@automerge/automerge";
import {Doc, Heads, Prop} from "@automerge/automerge";

// The name of the meta field that holds the last heads we reconciled with
const AM_PLUGIN: string = "automergePlugin"
const NEW_HEADS: string = "am_newHeads"
const RESET_UNRECONCILED: string = "am_resetUnreconciledSteps"
const IS_RECONCILIATION: string = "am_isReconciliation"
const SET_DOC: string = "am_setDoc"

const pluginKey: PluginKey<State> = new PluginKey(AM_PLUGIN)

type State = {
  lastHeads: Heads
  path: Prop[]
  doc: Doc<any>,
}

export default function(doc: Doc<any>, path: Prop[]): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init: () => ({ 
        lastHeads: automerge.getHeads(doc) ,
        path,
        unreconciledSteps: [],
        doc: automerge.clone(doc),
      }),
      apply: (tr: Transaction, prev: State): State => {
        if (isReconciliation(tr)) {
          return prev
        }
        let newHeads: Heads = tr.getMeta(NEW_HEADS)
        if (newHeads) {
          return {
            ...prev,
            lastHeads: newHeads,
          }
        } else if (tr.getMeta(RESET_UNRECONCILED)) {
          return {
            ...prev,
          }
        } else if (tr.getMeta(SET_DOC)) {
          let doc = tr.getMeta(SET_DOC)
          return {
            ...prev,
            doc,
          }
        } else {
          return {
            ...prev,
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

export function markAsReconciliation(tr: Transaction): Transaction {
  return tr.setMeta(IS_RECONCILIATION, true)
}

function isReconciliation(tr: Transaction): boolean {
  return !!tr.getMeta(IS_RECONCILIATION)
}

export function getDoc(state: EditorState): Doc<any> {
  return pluginKey.getState(state)!.doc
}

export function setDoc(tr: Transaction, doc: Doc<any>): Transaction {
  return tr.setMeta(SET_DOC, doc)
}
