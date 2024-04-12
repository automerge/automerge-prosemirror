import { NodeSpec, Schema, DOMOutputSpec, MarkSpec, Node, NodeType } from "prosemirror-model"
import { BlockMarker } from "./types"
import { next as am } from "@automerge/automerge"

// basics
const pDOM: DOMOutputSpec = ["p", 0]
const blockquoteDOM: DOMOutputSpec = ["blockquote", 0]
const hrDOM: DOMOutputSpec = ["hr"]
const preDOM: DOMOutputSpec = ["pre", ["code", 0]]

// marks
const emDOM: DOMOutputSpec = ["em", 0]
const strongDOM: DOMOutputSpec = ["strong", 0]
const codeDOM: DOMOutputSpec = ["code", 0]

// lists
const olDOM: DOMOutputSpec = ["ol", 0]
const ulDOM: DOMOutputSpec = ["ul", 0]
const liDOM: DOMOutputSpec = ["li", 0]

const schema = new Schema({
  nodes: {
    /// NodeSpec The top level document node.
    doc: {
      content: "block+",
    } as NodeSpec,

    /// A plain paragraph textblock. Represented in the DOM
    /// as a `<p>` element.
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM() {
        return pDOM
      },
    } as NodeSpec,

    /// A blockquote (`<blockquote>`) wrapping one or more blocks.
    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM() {
        return blockquoteDOM
      },
    } as NodeSpec,

    /// A horizontal rule (`<hr>`).
    horizontal_rule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM() {
        return hrDOM
      },
    } as NodeSpec,

    /// A heading textblock, with a `level` attribute that
    /// should hold the number 1 to 6. Parsed and serialized as `<h1>` to
    /// `<h6>` elements.
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } },
      ],
      toDOM(node) {
        return ["h" + node.attrs.level, 0]
      },
    } as NodeSpec,

    /// A code listing. Disallows marks or non-text inline
    /// nodes by default. Represented as a `<pre>` element with a
    /// `<code>` element inside of it.
    code_block: {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
      toDOM() {
        return preDOM
      },
    } as NodeSpec,

    /// The text node.
    text: {
      group: "inline",
    } as NodeSpec,

    /// An inline image (`<img>`) node. Supports `src`,
    /// `alt`, and `href` attributes. The latter two default to the empty
    /// string.
    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
      },
      group: "inline",
      draggable: true,
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs(dom: HTMLElement) {
            return {
              src: dom.getAttribute("src"),
              title: dom.getAttribute("title"),
              alt: dom.getAttribute("alt"),
            }
          },
        },
      ],
      toDOM(node) {
        const { src, alt, title } = node.attrs
        return ["img", { src, alt, title }]
      },
    } as NodeSpec,

    ordered_list: {
      group: "block",
      content: "list_item+",
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: "ol",
          getAttrs(dom: HTMLElement) {
            return {
              order: dom.hasAttribute("start")
                ? +dom.getAttribute("start")!
                : 1,
            }
          },
        },
      ],
      toDOM(node) {
        return node.attrs.order == 1
          ? olDOM
          : ["ol", { start: node.attrs.order }, 0]
      },
    } as NodeSpec,

    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM() {
        return ulDOM
      },
    },

    /// A list item (`<li>`) spec.
    list_item: {
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM() {
        return liDOM
      },
      defining: true,
    },

    aside: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "aside" }],
      toDOM() {
        return ["aside", 0]
      },
    },
  },
  marks: {
    /// A link. Has `href` and `title` attributes. `title`
    /// defaults to the empty string. Rendered and parsed as an `<a>`
    /// element.
    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs(dom: HTMLElement) {
            return {
              href: dom.getAttribute("href"),
              title: dom.getAttribute("title"),
            }
          },
        },
      ],
      toDOM(node) {
        const { href, title } = node.attrs
        return ["a", { href, title }, 0]
      },
    } as MarkSpec,

    /// An emphasis mark. Rendered as an `<em>` element. Has parse rules
    /// that also match `<i>` and `font-style: italic`.
    em: {
      parseDOM: [
        { tag: "i" },
        { tag: "em" },
        { style: "font-style=italic" },
        { style: "font-style=normal", clearMark: m => m.type.name == "em" },
      ],
      toDOM() {
        return emDOM
      },
    } as MarkSpec,

    /// A strong mark. Rendered as `<strong>`, parse rules also match
    /// `<b>` and `font-weight: bold`.
    strong: {
      parseDOM: [
        { tag: "strong" },
        // This works around a Google Docs misbehavior where
        // pasted content will be inexplicably wrapped in `<b>`
        // tags with a font-weight normal.
        {
          tag: "b",
          getAttrs: (node: HTMLElement) =>
            node.style.fontWeight != "normal" && null,
        },
        { style: "font-weight=400", clearMark: m => m.type.name == "strong" },
        {
          style: "font-weight",
          getAttrs: (value: string) =>
            /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
        },
      ],
      toDOM() {
        return strongDOM
      },
    } as MarkSpec,

    /// Code font mark. Represented as a `<code>` element.
    code: {
      parseDOM: [{ tag: "code" }],
      toDOM() {
        return codeDOM
      },
    } as MarkSpec,
  },
})


type NodeTemplate = {
  type: NodeType,
  attrs: { [key: string]: am.MaterializeValue }
  isEmbed?: boolean
  requiredParents?: NodeType[]
}

type BlockParser = (schema: Schema, block: BlockMarker) => NodeTemplate | undefined

export type SchemaAdapterConfig = {
  original: Schema,
  blockParsers: { [key: string]: BlockParser }
  unknownParser: (schema: Schema, block: BlockMarker) => NodeTemplate,
  renderNode: (schema: Schema, node: Node) => { type: string, attrs: { [key: string]: am.MaterializeValue } },
}

export class SchemaAdapter {
  #originalSchema: Schema
  #adaptedSchema: Schema
  #blockParsers: { [key: string]: BlockParser }
  #unknownParser: BlockParser

  constructor(config: SchemaAdapterConfig) {
    this.#originalSchema = config.original
    this.#blockParsers = config.blockParsers
    this.#unknownParser = config.unknownParser
    const markSpecs: { [key: string]: MarkSpec } = {}
    for (const [key, mark] of Object.entries(config.original.marks)) {
      markSpecs[key] = mark.spec
    }
    this.#adaptedSchema = new Schema({
      nodes: addIsAmgBlockAttr(config.original.spec.nodes.toObject()),
      marks: config.original.spec.marks,
    })
  }

  get schema() {
    return this.#adaptedSchema
  }
}

function addIsAmgBlockAttr(nodes: { [key: string]: NodeSpec }): {
  [key: string]: NodeSpec
} {
  for (const [_, node] of Object.entries(nodes)) {
    if (node.content) {
      node.attrs
        ? (node.attrs.isAmgBlock = { default: false })
        : (node.attrs = { isAmgBlock: { default: false } })
    }
  }
  return nodes
}

const basicAdapterConfig: SchemaAdapterConfig = {
  original: schema,
  blockParsers: {
    "paragraph": (schema: Schema, block) => {
      return {
        type: schema.nodes.paragraph,
        attrs: {}
      }
    },
    "heading": (schema: Schema, block) => {
      let level = 1
      if (block.attrs.level && (typeof block.attrs.level === "number")) {
        level = block.attrs.level
      }
      return {
        type: schema.nodes.heading,
        attrs: { level }
      }
    },
    "blockquote": (schema: Schema, block) => {
      return {
        type: schema.nodes.blockquote,
        attrs: {}
      }
    },
    "horizontal_rule": (schema: Schema, block) => {
      return {
        type: schema.nodes.horizontal_rule,
        attrs: {},
        isEmbed: true,
      }
    },
    "code_block": (schema: Schema, block) => {
      return {
        type: schema.nodes.code_block,
        attrs: {},
      }
    },
    "image": (schema: Schema, block) => {
      let src = ""
      let alt = ""
      let title = ""

      if (block.attrs.src && (block.attrs.src instanceof am.RawString)) {
        src = block.attrs.src.val
      }

      if (block.attrs.alt && (block.attrs.alt instanceof am.RawString)) {
        alt = block.attrs.alt.val
      }

      if (block.attrs.title && (typeof block.attrs.title === "string")) {
        title = block.attrs.title
      }

      return {
        type: schema.nodes.image,
        attrs: {
          src,
          alt,
          title,
        }
      }
    },
    "ordered-list-item": (schema: Schema, block) => {
      return {
        type: schema.nodes.list_item,
        attrs: {},
        requiredParents: [schema.nodes.ordered_list]
      }
    },
    "unordered-list-item": (schema: Schema, block) => {
      return {
        type: schema.nodes.list_item,
        attrs: {},
        requiredParents: [schema.nodes.bullet_list]
      }
    },
  },
  unknownParser(schema, block) {
    return {
      type: schema.nodes.paragraph,
      attrs: {}
    }
  },
  renderNode: (schema: Schema, node: Node) => {
    switch (node.type.name) {
      case "paragraph":
        return { type: "paragraph", attrs: {} }
      case "heading":
        //return { type: "heading", attrs: { level: (typeof node.attrs.level === "number")? node.attrs.level : 1 } }
        return { type: "heading", attrs: {} }
      case "blockquote":
        return { type: "blockquote", attrs: {} }
      case "horizontal_rule":
        return { type: "horizontal_rule", attrs: {} }
      case "code_block":
        return { type: "code_block", attrs: {} }
      case "image": {
        const attrs: { [key: string]: am.MaterializeValue } = {
          src: new am.RawString(node.attrs.src as string),
          alt: new am.RawString(node.attrs.alt as string),
          title: node.attrs.title as string
        }
        return {
          type: "image",
          attrs,
        }
      }
      case "ordered_list":
        return { type: "ordered_list", attrs: {} }
      case "bullet_list":
        return { type: "bullet_list", attrs: {} }
      case "list_item":
        return { type: "list_item", attrs: {} }
      default:
        return { type: "paragraph", attrs: {} }
    }
  }
}

export const basicAdapter = new SchemaAdapter(basicAdapterConfig)
