import { Node } from "prosemirror-model"
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state"
import { next as automerge } from "@automerge/automerge"
import { Doc, Heads, Prop } from "@automerge/automerge"
import { docFromSpans } from "./traversal"
import { schema } from "./schema"

// The name of the meta field that holds the last heads we reconciled with
const NEW_HEADS = "am_newHeads"

const AM_PLUGIN = "automergePlugin"

const pluginKey: PluginKey<State> = new PluginKey(AM_PLUGIN)

type State = {
  // The heads at the last point we updated the state of the editor from the
  // state of the automerge document
  lastHeads: Heads
  // The path to the field in the document containing the text
  path: Prop[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function plugin(
  doc: Doc<any>,
  path: Prop[],
): { plugin: Plugin; initialDoc: Node } {
  const pmDoc = docFromSpans(automerge.spans(doc, path))
  const plugin = new Plugin({
    key: pluginKey,
    view: view => {
      if (view.state.schema !== schema) {
        throw new Error(
          "the automerge plugin can only be used with the schema exported by the @automerge/prosemirror package",
        )
      }
      return {}
    },
    state: {
      init: () => ({
        lastHeads: automerge.getHeads(doc),
        path,
      }),
      apply: (tr: Transaction, prev: State): State => {
        const newHeadsAndTree: { heads: Heads } | undefined =
          tr.getMeta(NEW_HEADS)
        if (newHeadsAndTree) {
          const { heads } = newHeadsAndTree
          return {
            ...prev,
            lastHeads: heads,
          }
        } else {
          return {
            ...prev,
          }
        }
      },
    },
  })
  return { plugin, initialDoc: pmDoc }
}

export function getPath(state: EditorState): Prop[] {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return pluginKey.getState(state)!.path
}

export function getLastHeads(state: EditorState): Heads {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return pluginKey.getState(state)!.lastHeads
}

export function updateHeads(tr: Transaction, heads: Heads): Transaction {
  return tr.setMeta(NEW_HEADS, { heads: heads })
}
