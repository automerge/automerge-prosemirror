import {
  NodeSpec,
  Schema,
  MarkSpec,
  MarkType,
  Mark,
  Attrs,
  NodeType,
  Node,
} from "prosemirror-model"
import { next as am } from "@automerge/automerge"
import { BlockMarker } from "./types"

export interface MappedSchemaSpec {
  nodes: { [key: string]: MappedNodeSpec }
  marks?: { [key: string]: MappedMarkSpec }
}

export type MappedNodeSpec = NodeSpec & {
  automerge?: {
    unknownBlock?: boolean
    block?: BlockMappingSpec
    isEmbed?: boolean
    attrParsers?: {
      fromProsemirror: (node: Node) => { [key: string]: am.MaterializeValue }
      fromAutomerge: (block: BlockMarker) => Attrs
    }
  }
}

export type BlockMappingSpec = string | { within: { [key: string]: string } }

export type MappedMarkSpec = MarkSpec & {
  automerge?: {
    markName: string
    parsers?: {
      fromAutomerge: (value: am.MarkValue) => Attrs
      fromProsemirror: (mark: Mark) => am.MarkValue
    }
  }
}

export type MarkMapping = {
  automergeMarkName: string
  prosemirrorMark: MarkType
  parsers: {
    fromAutomerge: (value: am.MarkValue) => Attrs
    fromProsemirror: (mark: Mark) => am.MarkValue
  }
}

export type NodeMapping = {
  blockName: string
  outer: NodeType | null
  content: NodeType
  attrParsers?: {
    fromProsemirror: (node: Node) => { [key: string]: am.MaterializeValue }
    fromAutomerge: (block: BlockMarker) => Attrs
  }
  isEmbed?: boolean
}

export class SchemaAdapter {
  nodeMappings: NodeMapping[]
  markMappings: MarkMapping[]
  unknownBlock: NodeType
  unknownLeaf: NodeType
  unknownMark: MarkType
  schema: Schema

  constructor(spec: MappedSchemaSpec) {
    const actualSpec = shallowClone(spec)

    addAmgNodeStateAttrs(actualSpec.nodes)
    const unknownMarkSpec: MarkSpec = {
      attrs: { unknownMarks: { default: null } },
      toDOM() {
        return ["span", { "data-unknown-mark": true }]
      },
    }
    if (actualSpec.marks != null) {
      actualSpec.marks["unknownMark"] = unknownMarkSpec
    } else {
      actualSpec.marks = {
        unknownMark: unknownMarkSpec,
      }
    }

    actualSpec.nodes.unknownLeaf = {
      inline: true,
      attrs: { isAmgBlock: { default: true }, unknownBlock: { default: null } },
      group: "inline",
      toDOM() {
        return document.createTextNode("u{fffc}")
      },
    }

    const schema = new Schema(actualSpec)
    const nodeMappings: NodeMapping[] = []
    const markMappings: MarkMapping[] = []
    let unknownBlock: NodeType | null = null

    for (const [nodeName, nodeSpec] of Object.entries(actualSpec.nodes)) {
      const adaptSpec = nodeSpec.automerge
      if (adaptSpec == null) {
        continue
      }
      if (adaptSpec.unknownBlock) {
        if (unknownBlock != null) {
          throw new Error("only one node can be marked as unknownBlock")
        }
        unknownBlock = schema.nodes[nodeName]
      }
      if (adaptSpec.block != null) {
        if (typeof adaptSpec.block === "string") {
          const nodeMapping: NodeMapping = {
            blockName: adaptSpec.block,
            outer: null,
            content: schema.nodes[nodeName],
            isEmbed: adaptSpec.isEmbed || false,
          }
          if (adaptSpec.attrParsers != null) {
            nodeMapping.attrParsers = adaptSpec.attrParsers
          }
          nodeMappings.push(nodeMapping)
        } else {
          for (const [outerName, blockName] of Object.entries(
            adaptSpec.block.within,
          )) {
            const outerNode = schema.nodes[outerName]
            if (outerNode == null) {
              throw new Error(`${nodeSpec.name} references an unknown outer node
  ${outerName} in its within block mapping`)
            }
            nodeMappings.push({
              blockName,
              outer: schema.nodes[outerName],
              content: schema.nodes[nodeName],
            })
          }
        }
      }
    }

    for (const [markName, markSpec] of Object.entries(actualSpec.marks || {})) {
      const adaptSpec = markSpec.automerge
      if (adaptSpec == null) {
        continue
      }
      if (adaptSpec.markName != null) {
        let parsers
        if (adaptSpec.parsers != null) {
          parsers = adaptSpec.parsers
        } else {
          parsers = {
            fromAutomerge: () => ({}),
            fromProsemirror: () => true,
          }
        }
        markMappings.push({
          automergeMarkName: adaptSpec.markName,
          prosemirrorMark: schema.marks[markName],
          parsers,
        })
      }
    }

    if (unknownBlock == null) {
      throw new Error(
        `no unknown block specified: one node must be marked as the unknownblock
by setting the automerge.unknownBlock property to true`,
      )
    }

    this.unknownMark = schema.marks.unknownMark
    this.nodeMappings = nodeMappings
    this.markMappings = markMappings
    this.unknownLeaf = schema.nodes.unknownLeaf
    this.unknownBlock = unknownBlock
    this.schema = schema
  }
}

function shallowClone(spec: MappedSchemaSpec): MappedSchemaSpec {
  const nodes: { [key: string]: MappedNodeSpec } = {}
  for (const [nodeName, node] of Object.entries(spec.nodes)) {
    const shallowCopy = Object.assign({}, node)
    if (node.attrs != null) {
      shallowCopy.attrs = Object.assign({}, node.attrs)
    }
    nodes[nodeName] = shallowCopy
  }
  const marks: { [key: string]: MappedMarkSpec } = {}
  if (spec.marks != null) {
    for (const [markName, mark] of Object.entries(spec.marks)) {
      const shallowCopy = Object.assign({}, mark)
      if (mark.attrs != null) {
        shallowCopy.attrs = Object.assign({}, mark.attrs)
      }
      marks[markName] = shallowCopy
    }
  }
  return { nodes, marks }
}

function addAmgNodeStateAttrs(nodes: { [key: string]: MappedNodeSpec }): {
  [key: string]: MappedNodeSpec
} {
  for (const [name, node] of Object.entries(nodes)) {
    if (name !== "text") {
      if (node.attrs == null) {
        node.attrs = {
          isAmgBlock: { default: false },
          unknownAttrs: { default: null },
        }
      } else {
        node.attrs.isAmgBlock = { default: false }
        node.attrs.unknownAttrs = { default: null }
      }
    }
    if (node.automerge?.unknownBlock) {
      if (node.attrs == null) {
        node.attrs = {
          unknownParentBlock: { default: null },
          unknownBlock: { default: null },
        }
      } else {
        node.attrs.unknownParentBlock = { default: null }
        node.attrs.unknownBlock = { default: null }
      }
    }
  }
  return nodes
}

export function amMarksFromPmMarks(
  adapter: SchemaAdapter,
  marks: readonly Mark[],
): am.MarkSet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { [key: string]: any } = {}
  marks.forEach(mark => {
    const markMapping = adapter.markMappings.find(
      m => m.prosemirrorMark === mark.type,
    )
    if (markMapping != null) {
      result[markMapping.automergeMarkName] =
        markMapping.parsers.fromProsemirror(mark)
    } else if (mark.type === adapter.unknownMark) {
      for (const [key, value] of Object.entries(mark.attrs.unknownMarks)) {
        result[key] = value
      }
    }
  })
  return result
}

export function pmMarksFromAmMarks(
  adapter: SchemaAdapter,
  amMarks: am.MarkSet,
): Mark[] {
  const unknownMarks: { [key: string]: am.MaterializeValue } = {}
  let hasUnknownMark = false
  const pmMarks = []

  for (const [markName, markValue] of Object.entries(amMarks)) {
    // Filter tombstoned marks (https://github.com/automerge/automerge/issues/715).
		if (markValue == null) continue;
    const mapping = adapter.markMappings.find(
      m => m.automergeMarkName === markName,
    )
    if (mapping == null) {
      unknownMarks[markName] = markValue
      hasUnknownMark = true
    } else {
      pmMarks.push(
        mapping.prosemirrorMark.create(
          mapping.parsers.fromAutomerge(markValue),
        ),
      )
    }
  }

  if (hasUnknownMark) {
    pmMarks.push(adapter.unknownMark.create({ unknownMarks }))
  }

  return pmMarks
}
