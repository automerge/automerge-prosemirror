export { type DocHandle } from "./types.js"
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
