import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import * as automerge  from "@automerge/automerge";
import {Doc, Heads, Prop} from "@automerge/automerge";

// The name of the meta field that holds the last heads we reconciled with
const NEW_HEADS: string = "am_newHeads"

const AM_PLUGIN: string = "automergePlugin"
const pluginKey: PluginKey<State<any>> = new PluginKey(AM_PLUGIN)

type State<T> = {
  // The heads at the last point we updated the state of the editor from the 
  // state of the automerge document
  lastHeads: Heads
  // The path to the field in the document containing the text
  path: Prop[]
}

export function plugin<T>(doc: Doc<T>, path: Prop[]): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init: () => ({ 
        lastHeads: automerge.getHeads(doc) ,
        path,
      }),
      apply: (tr: Transaction, prev: State<any>): State<any> => {
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
