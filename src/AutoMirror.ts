import { next as automerge } from "@automerge/automerge"
import { EditorState, Transaction } from "prosemirror-state"
import { Node, Schema } from "prosemirror-model"
import amToPm from "./amToPm"
import { intercept } from "./intercept"
import { DocHandle } from "./DocHandle"
import { next as am } from "@automerge/automerge"
import { SchemaAdapter, SchemaAdapterConfig } from "./schema"
import { docFromSpans } from "./traversal"

type Doc<T> = automerge.Doc<T>
type Patch = automerge.Patch

export default class AutoMirror<T> {
  _inLocalTransaction = false
  path: am.Prop[]
  schemaAdapter: SchemaAdapter

  constructor(path: am.Prop[], schemaAdapter: SchemaAdapterConfig | SchemaAdapter) {
    this.path = path
    if (schemaAdapter instanceof SchemaAdapter) {
      this.schemaAdapter = schemaAdapter
    } else {
      this.schemaAdapter = new SchemaAdapter(schemaAdapter)
    }
  }

  get schema(): Schema {
    return this.schemaAdapter.schema
  }

  initialize(handle: DocHandle<T>): Node {
    const doc = handle.docSync()
    if (doc === undefined) throw new Error("Handle is not ready")
    const spans = automerge.spans(doc, this.path)
    return docFromSpans(this.schemaAdapter, spans)
  }

  intercept = (
    handle: DocHandle<T>,
    intercepted: Transaction,
    state: EditorState,
  ): EditorState => {
    this._inLocalTransaction = true
    const result = intercept(this.schemaAdapter, this.path, handle, intercepted, state)
    this._inLocalTransaction = false
    return result
  }

  reconcilePatch = (
    docBefore: Doc<T>,
    docAfter: Doc<T>,
    patches: Patch[],
    state: EditorState,
  ): EditorState => {
    if (this._inLocalTransaction) {
      return state
    }
    //console.log("reconciling")
    //console.log(patches)
    const headsBefore = automerge.getHeads(docBefore)

    const spans = automerge.spans(automerge.view(docAfter, headsBefore), this.path)
    const tx = amToPm(state.schema, this.schemaAdapter, spans, patches, this.path, state.tr, false)
    return state.apply(tx)
  }
}
