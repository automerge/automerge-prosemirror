import * as A from "@automerge/automerge/slim"
import { Node, Schema } from "prosemirror-model"
import { Plugin } from "prosemirror-state"
import { DocHandle } from "./DocHandle.js"
import { SchemaAdapter } from "./schema.js"
import { basicSchemaAdapter } from "./basicSchema.js"
import { pmDocFromSpans } from "./traversal.js"
import { syncPlugin } from "./syncPlugin.js"
export { type DocHandle }

export {
  SchemaAdapter,
  type MappedSchemaSpec,
  type MappedNodeSpec,
  type MappedMarkSpec,
  type BlockMappingSpec,
} from "./schema.js"
export { basicSchemaAdapter } from "./basicSchema.js"
export { pmDocFromSpans, pmNodeToSpans } from "./traversal.js"
export { syncPlugin, syncPluginKey } from "./syncPlugin.js"

/**
 * Initialize a ProseMirror document, schema, and plugin from an Automerge document
 *
 * @remarks
 * This function is used to create the initial ProseMirror schema, plugin, and document which you
 * pass to the ProseMirror Editor. If your text uses the
 * {@link https://automerge.org/docs/under-the-hood/rich_text_schema/ | default schema}
 * Then you can just pass the document handle and a path to the text field in the document,
 * otherwise you can pass the `schemaAdapter` option with your own adapter.
 *
 * @param handle - The DocHandle containing the text to edit
 * @param pathToTextField - The path to the text field in the automerge document
 * @param options - Additional options, this is where you can pass a custom schema adapter
 *
 * @returns A ProseMirror Schema, Node, and Plugin ready to pass to the ProseMirror Editor
 *
 * @example
 * Here's an example of basic usage for editing the description of a todo item
 *
 * ```ts
 * import { next as A } from "@automerge/automerge"
 * import { init } from "automerge-prosemirror"
 * import { EditorState } from "prosemirror-state"
 *
 * const repo = new Repo({network: []})
 * const handle = repo.create({ items: [{ description: "Hello World" }] })

 * const { schema, pmDoc, plugin } = init(amDoc, ["items", 0, "description"])
 * const state = EditorState.create({ schema, doc: pmDoc, plugins: [plugin] })
 * ```
 *
 * @example
 * Here's an example of using a custom schema adapter
 *
 * ```ts
 * import { Repo } from "@automerge/automerge-repo"
 * import { initPmDoc, SchemaAdapter } from "automerge-prosemirror"
 * import { EditorState } from "prosemirror-state"
 *
 * const repo = new Repo({network: []})
 * const handle = repo.create({ items: [{ description: "Hello World" }] })
 *
 * // Create and pass the custom schema adapter
 * const adapter = new SchemaAdapter( ... )
 * const { schema, pmDoc, plugin } = init(amDoc, ["items", 0, "description"], { schemaAdapter: adapter })
 *
 * const state = EditorState.create({ schema, doc: pmDoc, plugins: [plugin] })
 * ```
 */
export function init(
  handle: DocHandle<unknown>,
  pathToTextField: A.Prop[],
  options: { schemaAdapter: SchemaAdapter } | undefined = undefined,
): { schema: Schema; pmDoc: Node; plugin: Plugin } {
  const adapter = options?.schemaAdapter ?? basicSchemaAdapter
  const doc = handle.doc()
  const spans = A.spans(doc as A.Doc<unknown>, pathToTextField)
  const pmDoc = pmDocFromSpans(adapter, spans)
  const plugin = syncPlugin({ adapter, handle, path: pathToTextField })
  return { schema: adapter.schema, pmDoc, plugin }
}
