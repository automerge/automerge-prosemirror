import { NodeSpec, Schema, SchemaSpec } from "prosemirror-model"
import { schema as base } from "prosemirror-schema-basic"
import { addListNodes } from "prosemirror-schema-list"
import OrderedMap from "orderedmap"

/**
 * Add `isAmgBlock` attr to all NodeSpecs with content.
 * Use this when using a custom schema.
 */
export function addIsAmgBlockAttr(
  nodes: OrderedMap<NodeSpec>,
): OrderedMap<NodeSpec> {
  let copy = nodes
  nodes.forEach((name, node) => {
    if (node.content) {
      copy = copy.update(name, {
        ...node,
        attrs: {
          ...node.attrs,
          isAmgBlock: { default: false },
        },
      })
    }
  })
  return copy
}

const basicNodes: SchemaSpec["nodes"] = addListNodes(
  base.spec.nodes,
  "paragraph block*",
).append({
  aside: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "aside" }],
    toDOM() {
      return ["aside", 0]
    },
  },
})

const basicMarks: SchemaSpec["marks"] = base.spec.marks

export const schema = new Schema({
  nodes: addIsAmgBlockAttr(basicNodes),
  marks: basicMarks,
})
