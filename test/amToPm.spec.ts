import { assert } from "chai"
import { default as amToPm } from "../src/amToPm.js"
import { EditorState } from "prosemirror-state"
import {
  BlockDef,
  makeDoc,
  splitBlock,
  updateBlockType,
  assertPmDocsEqual,
} from "./utils.js"
import { next as am } from "@automerge/automerge"
import { basicSchemaAdapter } from "../src/basicSchema.js"

const schema = basicSchemaAdapter.schema

type PerformPatchArgs = {
  initialDoc: (string | BlockDef)[]
  patches: (((_: am.Prop[]) => am.Patch[]) | am.Patch)[]
  isLocal?: boolean
}

function performPatch({
  initialDoc,
  patches,
  //eslint-disable-next-line @typescript-eslint/no-unused-vars
  isLocal,
}: PerformPatchArgs): EditorState {
  const { editor, spans } = makeDoc(initialDoc)
  const amPatches: am.Patch[] = []
  for (const patchOrFactory of patches) {
    if (typeof patchOrFactory === "function") {
      amPatches.push(...patchOrFactory(["text"]))
    } else {
      amPatches.push(patchOrFactory)
    }
  }
  const tx = amToPm(basicSchemaAdapter, spans, amPatches, ["text"], editor.tr)
  return editor.apply(tx)
}

describe("the amToPm function", () => {
  describe("when handling splice", () => {
    it("should insert characters in the top level text when splicing", () => {
      const patched = performPatch({
        initialDoc: ["world"],
        patches: [
          {
            action: "splice",
            path: ["text", 0],
            value: "hello ",
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("hello world"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should correctly insert characters at the end of a list item", () => {
      const patched = performPatch({
        initialDoc: [
          {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
          "item 1",
        ],
        patches: [
          {
            action: "splice",
            path: ["text", 7],
            value: "1",
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("bullet_list", null, [
            schema.node("list_item", null, [
              schema.node("paragraph", null, []),
              schema.node("ordered_list", null, [
                schema.node("list_item", { isAmgBlock: true }, [
                  schema.node("paragraph", null, [schema.text("item 11")]),
                ]),
              ]),
            ]),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should add marks to inserted characters", () => {
      const patched = performPatch({
        initialDoc: ["world"],
        patches: [
          {
            action: "splice",
            path: ["text", 2],
            value: "o",
            marks: { strong: true },
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("wo", []),
            schema.text("o", [schema.mark("strong")]),
            schema.text("rld", []),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should update the selection to be just after the character inserted when local", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item"],
        patches: [
          {
            action: "splice",
            path: ["text", 1],
            value: "i",
          },
          {
            action: "splice",
            path: ["text", 2],
            value: "i",
          },
          {
            action: "splice",
            path: ["text", 3],
            value: "i",
          },
        ],
        isLocal: true,
      })
      // afterwards
      //   <p> i i i i t e m </p>
      // 0    1 2 3 4 5 6 7 8    9
      assert.equal(patched.selection.from, 4)
      assert.equal(patched.selection.to, 4)
    })

    it("should calculate the correct index when deleting the first block", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "heading", parents: [], attrs: { level: 1 } },
          "Untitled",
        ],
        patches: [
          {
            action: "del",
            path: ["text", 1],
            length: 8,
          },
          {
            action: "splice",
            path: ["text", 1],
            value: "a",
          },
        ],
      }).doc
      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("heading", { isAmgBlock: true }, [schema.text("a", [])]),
        ]),
        actual: patched,
      })
    })
  })

  describe("when handling mark", () => {
    it("should add marks to existing text", () => {
      const patched = performPatch({
        initialDoc: ["world"],
        patches: [
          {
            action: "mark",
            path: ["text"],
            marks: [{ name: "strong", value: true, start: 1, end: 3 }],
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("w", []),
            schema.text("or", [schema.mark("strong")]),
            schema.text("ld", []),
          ]),
        ]),
        actual: patched,
      })
    })
  })

  describe("when handling splitBlock", () => {
    it("should insert new paragraphs at the top level", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [splitBlock(6, { type: "paragraph", parents: [], attrs: {} })],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("hello "),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("world"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should convert a top level inferred para to explicit if a splitblock arrives at the top level", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [splitBlock(0, { type: "paragraph", parents: [], attrs: {} })],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("hello world"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should insert a second paragraph after converting the inferred top level para to explicit", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [
          splitBlock(0, { type: "paragraph", parents: [], attrs: {} }),
          splitBlock(1, { type: "paragraph", parents: [], attrs: {} }),
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, []),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("hello world"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should insert new list items at the top level", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item 1",
        ],
        patches: [
          splitBlock(7, { type: "ordered-list-item", parents: [], attrs: {} }),
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("ordered_list", null, [
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("item 1")]),
            ]),
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, []),
            ]),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should insert new list items after existing list items", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "paragraph", parents: [], attrs: {} },
          "item 1",
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item 2",
        ],
        patches: [
          splitBlock(14, { type: "ordered-list-item", parents: [], attrs: {} }),
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("item 1"),
          ]),
          schema.node("ordered_list", null, [
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("item 2")]),
            ]),
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, []),
            ]),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should add a paragraph inside a list item", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "paragraph", parents: [], attrs: {} },
          "item 1",
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item 2",
          { type: "ordered-list-item", parents: [], attrs: {} },
        ],
        patches: [
          splitBlock(15, {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          }),
        ],
      })

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("item 1"),
          ]),
          schema.node("ordered_list", null, [
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("item 2")]),
            ]),
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", { isAmgBlock: true }, []),
            ]),
          ]),
        ]),
        actual: patched.doc,
      })
    })

    it("should split the text in a paragraph", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item 1"],
        patches: [splitBlock(4, { type: "paragraph", parents: [], attrs: {} })],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [schema.text("ite")]),
          schema.node("paragraph", { isAmgBlock: true }, [schema.text("m 1")]),
        ]),
        actual: patched,
      })
    })

    it("should correctly handle a splitblock which is separated by a text insert", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "heading", parents: [], attrs: { level: 1 } },
          "Heading",
          { type: "paragraph", parents: [], attrs: {} },
          "some text",
          { type: "paragraph", parents: [], attrs: {} },
          "b",
        ],
        patches: [
          {
            action: "insert",
            path: ["text", 20],
            values: [{}],
          },
          {
            action: "splice",
            path: ["text", 21],
            value: "a",
          },
          {
            action: "put",
            path: ["text", 20, "attrs"],
            value: {},
          },
          {
            action: "put",
            path: ["text", 20, "type"],
            value: "paragraph",
          },
          {
            action: "put",
            path: ["text", 20, "parents"],
            value: [],
          },
        ],
      })

      // am:        0        1 2 3 4 5 6 7             8          9  10 11 12 13  14 15 16 17              18         19
      //     <doc> <heading> H e a d i n g </heading> <paragraph> s  o  m  e  ' ' t  e  x  t </paragraph> <paragraph> b </paragraph> <paragraph> </paragraph> </doc>
      // pm: 0              1 2 3 4 5 6 7 8          9          10 11 12 13 14  15 16 17 18 19          20          21 22          23           24           25

      //console.log(JSON.stringify(printTree(patched.doc), null, 2))
      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("heading", { isAmgBlock: true }, [
            schema.text("Heading"),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("some text"),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [schema.text("b")]),
          schema.node("paragraph", { isAmgBlock: true }, [schema.text("a")]),
        ]),
        actual: patched.doc,
      })
    })
  })

  describe("when handling delete", () => {
    it("should delete characters at the end of the text", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [
          {
            action: "del",
            path: ["text", 10],
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("hello worl"),
          ]),
        ]),
        actual: patched,
      })
    })
  })

  describe("when handling joinBlock", () => {
    it("should merge the text of two sibling paragraphs into one", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "paragraph", parents: [], attrs: {} },
          "hello ",
          { type: "paragraph", parents: [], attrs: {} },
          "world",
        ],
        patches: [
          {
            action: "del",
            path: ["text", 7],
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("hello world"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should handle deletion of a range, followed by a deleted block, followed by a deletion", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "paragraph", parents: [], attrs: {} },
          "line one",
          { type: "paragraph", parents: [], attrs: {} },
          "line two",
          { type: "paragraph", parents: [], attrs: {} },
          "line three",
        ],
        patches: [
          {
            action: "del",
            path: ["text", 6],
            length: 3,
          },
          {
            action: "del",
            path: ["text", 6],
          },
          {
            action: "del",
            path: ["text", 6],
            length: 5,
          },
        ],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("line two"),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("line three"),
          ]),
        ]),
        actual: patched,
      })
    })
  })

  describe("when handling updateBlock", () => {
    it("should convert a sole list item into a paragraph", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item one",
        ],
        patches: [updateBlockType(0, "paragraph")],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("item one"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should convert the last item in a multi item list into a paragraph", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item one",
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item two",
        ],
        patches: [updateBlockType(9, "paragraph")],
      }).doc

      //
      //    <doc><ol><li><p> i t e m ' ' o  n  e  </p></li><li><p> i  t  e  m ' ' t  w  o </p></li></ol></doc>
      //pm:0         1   2  3 4 5 6 7   8  9  10 11  12   13  14 15 16 17 18 19 20 21 22 23  24   25   26   27     28
      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("ordered_list", null, [
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("item one")]),
            ]),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("item two"),
          ]),
        ]),
        actual: patched,
      })
    })

    it("should convert a sole paragraph into a list item", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item one"],
        patches: [updateBlockType(0, "ordered-list-item")],
      }).doc

      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("ordered_list", null, [
            schema.node("list_item", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("item one")]),
            ]),
          ]),
        ]),
        actual: patched,
      })
    })
  })
})
