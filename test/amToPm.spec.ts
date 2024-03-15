import { assert } from "chai"
import { default as amToPm } from "../src/amToPm"
import { EditorState } from "prosemirror-state"
import { BlockDef, makeDoc, printTree } from "./utils"
import { next as am } from "@automerge/automerge"
import { schema } from "../src/schema"

type PerformPatchArgs = {
  initialDoc: (string | BlockDef)[]
  patches: am.Patch[]
  isLocal?: boolean
}

function performPatch({
  initialDoc,
  patches,
  isLocal,
}: PerformPatchArgs): EditorState {
  const { editor, spans } = makeDoc(initialDoc)
  const tx = amToPm(schema, spans, patches, ["text"], editor.tr, !!isLocal)
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

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: false }, [
              schema.text("hello world"),
            ]),
          ]),
        ),
      )
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

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
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
        ),
      )
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

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: false }, [
              schema.text("wo", []),
              schema.text("o", [schema.mark("strong")]),
              schema.text("rld", []),
            ]),
          ]),
        ),
      )
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

    it("should update the selection to be in the next line when inserting a new paragraph block in a list item", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "paragraph", parents: [], attrs: {} },
          "item 1",
          { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
          "item 2",
          { type: "paragraph", parents: [], attrs: {} },
          "item 3",
        ],
        patches: [
          {
            action: "updateBlock",
            path: ["text", 14],
            index: 14,
            new_parents: ["ordered-list-item"],
            new_type: null,
            new_attrs: null,
          },
          {
            action: "splitBlock",
            path: ["text", 15],
            index: 15,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      // afterwards
      //    <p> i t e m 1 </p> <ol> <li> <p> i  t  e  m  2  </p> </li> </ol> <p>  i  t  e  m  3 </p>
      //   0   1 2 3 4 5 6    7    8    9  10 11 12 13 14 15    16    17   18   19 20 21 22 23 24  25
      //assert.equal(patched.selection.from,
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

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: false }, [
              schema.text("w", []),
              schema.text("or", [schema.mark("strong")]),
              schema.text("ld", []),
            ]),
          ]),
        ),
      )
    })
  })

  describe("when handling splitBlock", () => {
    it("should insert new paragraphs at the top level", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 6],
            index: 6,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: false }, [
              schema.text("hello "),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("world"),
            ]),
          ]),
        ),
      )
    })

    it("should convert a top level inferred para to explicit if a splitblock arrives at the top level", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 0],
            index: 0,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("hello world"),
            ]),
          ]),
        ),
      )
    })

    it("should insert a second paragraph after converting the inferred top level para to explicit", () => {
      const patched = performPatch({
        initialDoc: ["hello world"],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 0],
            index: 0,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
          {
            action: "splitBlock",
            path: ["text", 1],
            index: 1,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, []),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("hello world"),
            ]),
          ]),
        ),
      )
    })

    it("should insert new list items at the top level", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item 1",
        ],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 7],
            index: 7,
            type: "ordered-list-item",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 1")]),
              ]),
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
            ]),
          ]),
        ),
      )
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
          {
            action: "splitBlock",
            path: ["text", 14],
            index: 14,
            type: "ordered-list-item",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
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
        ),
      )
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
          {
            action: "splitBlock",
            path: ["text", 15],
            index: 15,
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        ],
      })

      assert.isTrue(
        patched.doc.eq(
          schema.node("doc", null, [
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
        ),
      )
    })

    it("should update selection to point at the newly inserted block when local", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item 1"],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 7],
            index: 7,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
        isLocal: true,
      })

      assert.isTrue(
        patched.doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 1"),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, []),
          ]),
        ),
      )
      assert.equal(patched.selection.from, 9)
    })

    it("should split the text in a paragraph", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item 1"],
        patches: [
          {
            action: "splitBlock",
            path: ["text", 4],
            index: 4,
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("ite"),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("m 1"),
            ]),
          ]),
        ),
      )
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

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: false }, [
              schema.text("hello worl"),
            ]),
          ]),
        ),
      )
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
            action: "joinBlock",
            path: ["text", 7],
            index: 7,
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("hello world"),
            ]),
          ]),
        ),
      )
    })

    it("should handle deletion of a range, followed by a joinBlock, followed by a deletion", () => {
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
            action: "joinBlock",
            path: ["text"],
            index: 6,
          },
          {
            action: "del",
            path: ["text", 6],
            length: 5,
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("line two"),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("line three"),
            ]),
          ]),
        ),
      )
    })
  })

  describe("when handling updateBlock", () => {
    it("should convert a sole list item into a paragraph", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item one",
        ],
        patches: [
          {
            action: "updateBlock",
            path: ["text"],
            index: 0,
            new_type: "paragraph",
            new_parents: null,
            new_attrs: null,
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item one"),
            ]),
          ]),
        ),
      )
    })

    it("should convert the last item in a multi item list into a paragraph", () => {
      const patched = performPatch({
        initialDoc: [
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item one",
          { type: "ordered-list-item", parents: [], attrs: {} },
          "item two",
        ],
        patches: [
          {
            action: "updateBlock",
            path: ["text"],
            index: 9,
            new_type: "paragraph",
            new_parents: null,
            new_attrs: null,
          },
        ],
      }).doc

      //
      //    <doc><ol><li><p> i t e m ' ' o  n  e  </p></li><li><p> i  t  e  m ' ' t  w  o </p></li></ol></doc>
      //pm:0         1   2  3 4 5 6 7   8  9  10 11  12   13  14 15 16 17 18 19 20 21 22 23  24   25   26   27     28
      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item one")]),
              ]),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item two"),
            ]),
          ]),
        ),
      )
    })

    it("should convert a sole paragraph into a list item", () => {
      const patched = performPatch({
        initialDoc: [{ type: "paragraph", parents: [], attrs: {} }, "item one"],
        patches: [
          {
            action: "updateBlock",
            path: ["text"],
            index: 0,
            new_type: "ordered-list-item",
            new_parents: null,
            new_attrs: null,
          },
        ],
      }).doc

      assert.isTrue(
        patched.eq(
          schema.node("doc", null, [
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item one")]),
              ]),
            ]),
          ]),
        ),
      )
    })
  })
})