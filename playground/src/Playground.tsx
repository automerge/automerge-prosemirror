import React, { useEffect, useState } from "react"
import { Editor } from "./Editor"
import { Repo, DocHandle } from "@automerge/automerge-repo"
//import { MessageChannelNetworkAdapter } from "@automerge/automerge-repo-network-messagechannel"
import { PausableNetworkAdapter } from "./PausableNetworkAdapter"
import TabContainer from "./Tabs"
import {
  MappedMarkSpec,
  MappedNodeSpec,
  SchemaAdapter,
  basicSchemaAdapter,
} from "../../src"
import { Mark, Node } from "prosemirror-model"
import { BlockMarker } from "../../src/types"
import { next as am } from "@automerge/automerge"

const { port1: leftToRight, port2: rightToLeft } = new MessageChannel()

const leftAdapter = new PausableNetworkAdapter(leftToRight)
const leftRepo = new Repo({
  //network: [new MessageChannelNetworkAdapter(leftToRight)],
  network: [leftAdapter],
})

const rightAdapter = new PausableNetworkAdapter(rightToLeft)
const rightRepo = new Repo({
  //network: [new MessageChannelNetworkAdapter(rightToLeft)],
  network: [rightAdapter],
})

const leftHandle = leftRepo.create()
leftHandle.change(d => {
  d.text = ""
  am.splitBlock(d, ["text"], 0, {
    type: new am.RawString("ordered-list-item"),
    attrs: { level: 1 },
    parents: [],
  })
  am.splitBlock(d, ["text"], 1, {
    type: new am.RawString("ordered-list-item"),
    attrs: { level: 1 },
    parents: [],
  })
  am.splice(d, ["text"], 2, 0, "item two")
})

const rightHandle = rightRepo.find(leftHandle.url)

type Props = {
  /** If building for demo mode then just render a single side-by-side panel,
   * otherwise render multiple tabs for different scenarios.
   *
   * This is so that the demo which we show on the blog post (which is just
   * this playground) is simple.
   * */
  demoMode: boolean
}

function Playground({ demoMode }: Props) {
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    if (!connected) {
      leftAdapter.pause()
    } else {
      leftAdapter.resume()
    }
  }, [connected])

  const sameSchema = (
    <SameSchema
      leftHandle={leftHandle}
      rightHandle={rightHandle}
      showTitle={!demoMode}
    />
  )

  let content: JSX.Element
  if (demoMode) {
    content = sameSchema
  } else {
    const tabs = [
      {
        label: "Same Schema",
        content: [sameSchema],
      },
      {
        label: "Different Schema",
        content: (
          <DifferentSchema
            leftHandle={leftHandle}
            rightHandle={rightHandle}
            showTitle={true}
          />
        ),
      },
    ]
    content = <TabContainer tabs={tabs} />
  }

  return (
    <div id="playground">
      <h1>Automerge + Prosemirror</h1>
      <label>
        Connected
        <input
          type="checkbox"
          checked={connected}
          onChange={e => setConnected(e.target.checked)}
        />
      </label>
      {content}
    </div>
  )
}

type TabProps = {
  leftHandle: DocHandle<{ text: string }>
  rightHandle: DocHandle<{ text: string }>
  showTitle: boolean
}

function SameSchema({ leftHandle, rightHandle, showTitle }: TabProps) {
  return (
    <div>
      {showTitle && <h2>Same Schema</h2>}
      <div id="editors">
        <div className="editor">
          <Editor
            name="left"
            handle={leftHandle}
            path={["text"]}
            schemaAdapter={basicSchemaAdapter}
          />
        </div>
        <div className="editor">
          <Editor
            name="right"
            handle={rightHandle}
            path={["text"]}
            schemaAdapter={basicSchemaAdapter}
          />
        </div>
      </div>
    </div>
  )
}

function DifferentSchema({ leftHandle, rightHandle, showTitle }: TabProps) {
  return (
    <div>
      {showTitle && <h2>Different Schema</h2>}
      <div id="editors">
        <div className="editor">
          <Editor
            name="left"
            handle={leftHandle}
            path={["text"]}
            schemaAdapter={paragraphAndHeadingSchemaAdapter}
          />
        </div>
        <div className="editor">
          <Editor
            name="right"
            handle={rightHandle}
            path={["text"]}
            schemaAdapter={paragraphAndListItemsSchemaAdapter}
          />
        </div>
      </div>
    </div>
  )
}

const paragraphAndHeadingSchemaAdapter = new SchemaAdapter({
  nodes: {
    doc: {
      content: "block+",
    } as MappedNodeSpec,
    text: {
      group: "inline",
    } as MappedNodeSpec,
    paragraph: {
      content: "text*",
      group: "block",
      automerge: {
        block: "paragraph",
      },
      parseDOM: [{ tag: "p" }],
      toDOM() {
        return ["p", 0]
      },
    },

    unknownBlock: {
      automerge: {
        unknownBlock: true,
      },
      group: "block",
      content: "block+",
      parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
      toDOM() {
        return ["div", { "data-unknown-block": "true" }, 0]
      },
    },
    heading: {
      content: "text*",
      group: "block",
      attrs: {
        level: { default: 1 },
      },
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
      automerge: {
        block: "heading",
        attrParsers: {
          fromAutomerge: (block: BlockMarker) => ({ level: block.attrs.level }),
          fromProsemirror: (node: Node) => ({ level: node.attrs.level }),
        },
      },
    },
  } as MappedNodeSpec,
  marks: {
    /// An emphasis mark. Rendered as an `<em>` element. Has parse rules
    /// that also match `<i>` and `font-style: italic`.
    em: {
      parseDOM: [
        { tag: "i" },
        { tag: "em" },
        { style: "font-style=italic" },
        {
          style: "font-style=normal",
          clearMark: (m: Mark) => m.type.name == "em",
        },
      ],
      toDOM() {
        return ["em", 0]
      },
      automerge: {
        markName: "em",
      },
    },
  },
})

const paragraphAndListItemsSchemaAdapter = new SchemaAdapter({
  nodes: {
    doc: {
      content: "block+",
    } as MappedNodeSpec,

    text: {
      group: "inline",
    } as MappedNodeSpec,

    paragraph: {
      content: "text*",
      group: "block",
      automerge: {
        block: "paragraph",
      },
      parseDOM: [{ tag: "p" }],
      toDOM() {
        return ["p", 0]
      },
    },

    unknownBlock: {
      automerge: {
        unknownBlock: true,
      },
      group: "block",
      content: "block+",
      parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
      toDOM() {
        return ["div", { "data-unknown-block": "true" }, 0]
      },
    },

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
                ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  +dom.getAttribute("start")!
                : 1,
            }
          },
        },
      ],
      toDOM(node) {
        return node.attrs.order == 1
          ? ["ol", 0]
          : ["ol", { start: node.attrs.order }, 0]
      },
    } as MappedNodeSpec,

    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM() {
        return ["ul", 0]
      },
    },

    /// A list item (`<li>`) spec.
    list_item: {
      automerge: {
        block: {
          within: {
            ordered_list: "ordered-list-item",
            bullet_list: "unordered-list-item",
          },
        },
      },
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM() {
        return ["li", 0]
      },
      defining: true,
    },
  },
  marks: {
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
        return ["strong", 0]
      },
      automerge: {
        markName: "strong",
      },
    } as MappedMarkSpec,
  },
})

export default Playground
