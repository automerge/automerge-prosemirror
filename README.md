# Automerge prosemirror bindings

Collaborate on rich text documents which follow the [rich text schema](https://automerge.org/docs/under-the-hood/rich_text_schema/) using ProseMirror.

## Status

This plugin is beta quality software. The API will probably change a bit before a stable release and there are bugs, but it also works reasonably well.

## How to play

There is a fully functional editor in this repository, you can play with that by running `npm run playground` and then visiting `http://localhost:5173`.

## Example

The API for this library is based around `syncPlugin`. This plugin is used to apply transactions from Prosemirror and to handle changes received over the network. This is best used in tandem with `@automerge/automerge-repo`. See the `playground/src/Editor.tsx` file for a fully featured example.

In order to edit rich text we need to know how to map from the [rich text schema](https://automerge.org/docs/under-the-hood/rich_text_schema/) to the ProseMirror schema you're using. This is done with a `SchemaAdapter`. We provide a built in `basicSchemaAdapter` which adapts the basic example schema which ships with ProseMirror, but you can provide your own as well.

Example setup

```javascript
import {basicSchemaAdapter, syncPlugin, docFromSpans} from "@automerge/prosemirror"
import { next as am } from "@automerge/automerge"

const handle = repo.find("some-doc-url")
// somehow wait for the handle to be ready before continuing
await handle.whenReady()

const adapter = basicSchemaAdapter

// Create your prosemirror state
let editorConfig = {
  schema: adapter.schema,
  plugins: [
    keymap({
      ...baseKeymap,
      "Mod-b": toggleBold,
      "Mod-i": toggleItalic,
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
    }),
    syncPlugin({
      adapter,
      handle,
      path: ["text"]
    })
  ],
  doc: docFromSpans(adapter, am.spans(handle.docSync()!, ["text"]))
}

let state = EditorState.create(editorConfig)

const view = new EditorView(<whatever DOM element you are rendering to>, {
  state
})
```

## Schema Mapping

ProseMirror documents have a schema, which determines the kinds of nodes and marks which are allowed in the document. In order to map between the block markers and marks in the Automerge document and the ProseMirror document you must create a `SchemaAdapter`. The argument to the `SchemaAdapter` is the same as the `{nodes, marks}` object you would use to create a `ProseMirror` schema, but the `nodes` and `marks` objects have an additional optional key called `automerge`, which configures how the automerge document is mapped to the ProseMirror document.

For example, here's a snippet which maps the `paragraph` node to the `paragraph` block type:

```typescript
import {SchemaAdapter} from "@automerge/prosemirror"
const adapter = new SchemaAdapter({
    nodes: {
        ... // other nodes
        /// A plain paragraph textblock. Represented in the DOM
        /// as a `<p>` element.
        paragraph: {
          // ---------------------------------------
          //    This is the automerge configuration
          // ---------------------------------------
          automerge: {
            block: "paragraph",
          },
          // ---------------------------------------
          content: "inline*",
          group: "block",
          parseDOM: [{ tag: "p" }],
          toDOM() {
            return pDOM
          },
        } as NodeSpec,
    }
})
```

There are a number of keys available in the `automerge` mapping. To understand what they all mean you need to understand the goals of schema mapping:

- Converting between automerge blocks and ProseMirror nodes
- Converting between automerge marks and ProseMirror marks
- Representing unknown blocks and marks in the ProseMirror document so that editing a document with unknown marks or blocks does not cause them to be lost

### Converting blocks to nodes

#### Simple block <-> node mappings

The simple case of converting blocks to nodes is when there is a one-to-one mapping from the block type to the node type and the node doesn't have any extra attributes. As in the case of the paragraph marker above, this typically looks like:

```typescript
nodes: {
    <node name>: {
        // rest of the node spec
        automerge: {
            block: <block name>
        }
    }
}
```

#### Mappings which depend on their parents

A more complex case is when the type of the block depends on surrounding content. For example, a `<li>` node in ProseMirror can be either an `ordered-list-item` or an `unordered-list-item` in the rich text schema. In this case you can use the `within` key:

```typescript
nodes: {
    list_item: {
        // rest of the node spec
        automerge: {
            // Here the keys of the map are other nodes in the schema
            within: {
                ordered_list: "ordered-list-item",
                bullet_list: "unordered-list-item"
            }
        }
    }
}
```

#### Mappings which have extra attributes

Many nodes and block markers are more complex than just a type name. They also carry attributes. In this case you use the `attrParsers` of the `automerge` key. For example, the `heading` block marker has a `level` attribute which is used to determine the level of the heading. This is how you would map that to a ProseMirror node:

```typescript
nodes: {
    heading {
    // rest of the node spec
      automerge: {
        block: "heading",
        attrParsers: {
          fromAutomerge: block => ({ level: block.attrs.level }),
          fromProsemirror: node => ({ level: node.attrs.level }),
        },
      },
    }
}
```

The `fromAutomerge` function will be passed the block marker and should return a set of node attributes whilst the `fromProsemirror` function will be passed a node and should return map of block attributes.

#### Embedded blocks

Some block types do not represent hierarchical content but instead represent embedded content which does not change the structural role of text following them. For example, an image block tag just indicates that an image should appear at the location of the block marker. For these kinds of blocks you can set the `isEmbed` key to `true`:

```typescript
nodes: {
  image: {
    // the rest of the node spec
    automerge: {
      block: "image",
      isEmbed: true,
      attrParsers: { .. },
    }
  }
}
```

### Converting marks to marks

Marks are a bit simpler than blocks. The `automerge` key on a mark spec can contain a `markName` key which specifies what mark in the automerge document corresponds to this mark in the ProseMirror document.

For example, a `strong` mark might be mapped like this:

```typescript
marks: {
    strong: {
      // rest of the mark spec
      automerge: {
        markName: "strong",
      },
    },
}
```

As with blocks some marks also have attributes which need to be converted. This is done with the `attrParsers` key. Unlike blocks marks cannot store complex content on the mark value in automerge, so in the parsers we typically convert to and from a JSON encoded string, like so:

```typescript
marks: {
    link: {
      automerge: {
        markName: "link",
        parsers: {
          fromAutomerge: (mark: am.MarkValue) => {
            if (typeof mark === "string") {
              try {
                const value = JSON.parse(mark)
                return {
                  href: value.href || "",
                  title: value.title || "",
                }
              } catch (e) {
                console.warn("failed to parse link mark as JSON")
              }
            }
            return {
              href: "",
              title: "",
            }
          },
          fromProsemirror: (mark: Mark) =>
            JSON.stringify({
              href: mark.attrs.href,
              title: mark.attrs.title,
            }),
        },
      },
  }
}
```

#### Unknown blocks

Every schema adapter must provide some way to represent unknown blocks. This allows applications using different schema to collaborate on the same text document. Unknown blocks will be represented my the `node` which has the `automerge.unknownBlock` key set to true and which can contain any other node in the schema.

An easy way to do this is:

```typescript
nodes: {
  unknownBlock: {
    automerge: {
      unknownBlock: true,
    },
    group: "block",
    content: "block+", // Allow any block content
    parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
    toDOM() {
      return ["div", { "data-unknown-block": "true" }, 0]
    },
  },
}
```

## API

### `SchemaAdapter`

A `SchemaAdapter` provides the mapping between a ProseMirror Schema and the block markers you are using in the automerge document. The part of this API to understand is the specification which you pass to the `SchemaAdapter` constructor.

A schema adapter specification is an extension of a ProseMirror schema. It constists of an object with a `nodes` key and a `marks` key, each of which are like their equivalents in a ProseMirror schema but with a few additional keys.

The `nodes` values must be ProseMirror `NodeSpec` objects with an additional `automerge` key with the following type:

```typescript
type AutomergeNodeSpec = {
  unknownBlock?: boolean
  block?: BlockMappingSpec
  isEmbed?: boolean
  attrParsers?: {
    fromProsemirror: (node: Node) => { [key: string]: am.MaterializeValue }
    fromAutomerge: (block: BlockMarker) => Attrs
  }
}

type BlockMappingSpec = string | { within: { [key: string]: string } }

type BlockMarker = {
  type: automerge.RawString
  parents: automerge.RawString[]
  attrs: { [key: string]: any }
  isEmbed?: boolean
}
```

The `marks` values must be ProseMirror `MarkSpec` objects with an additional `automerge` key with the following type:

```typescript
automerge?: {
    markName: string
    parsers?: {
      fromAutomerge: (value: automerge.MarkValue) => Attrs
      fromProsemirror: (mark: Mark) => automerge.MarkValue
    }
  }

```
