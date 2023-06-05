import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import * as automerge  from "@automerge/automerge";
import {Doc, Heads, Prop} from "@automerge/automerge";

// The name of the meta field that holds the last heads we reconciled with
const NEW_HEADS: string = "am_newHeads"

const AM_PLUGIN: string = "automergePlugin"
const pluginKey: PluginKey<State> = new PluginKey(AM_PLUGIN)

type State = {
  lastHeads: Heads
  path: Prop[]
}

export function plugin(doc: Doc<any>, path: Prop[]): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init: () => ({ 
        lastHeads: automerge.getHeads(doc) ,
        path,
        unreconciledSteps: [],
      }),
      apply: (tr: Transaction, prev: State): State => {
        let newHeads: Heads = tr.getMeta(NEW_HEADS)
        if (newHeads) {
          return {
            ...prev,
            lastHeads: newHeads,
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
