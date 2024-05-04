import { Fragment, Slice, Node } from "prosemirror-model"
import { assertSplitBlock, makeDoc } from "./utils"
import { AddMarkStep, ReplaceStep, Step } from "prosemirror-transform"
import { default as pmToAm } from "../src/pmToAm"
import { next as am } from "@automerge/automerge"
import { schema } from "../src/schema"
import { assert } from "chai"

function updateDoc(
  amDoc: am.Doc<unknown>,
  pmDoc: Node,
  steps: Step[],
): am.Patch[] {
  const heads = am.getHeads(amDoc)
  const spans = am.spans(amDoc, ["text"])
  const updatedDoc = am.change(amDoc, d => {
    pmToAm(spans, steps, d, pmDoc, ["text"])
  })
  return am.diff(amDoc, heads, am.getHeads(updatedDoc))
}

describe("when converting a ReplaceStep to a change", () => {
  it("should convert a <li></li> ReplaceStep in a list item to a splitblock", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    // am:            0    1  2 3 4  5  6
    //     <doc><ol> <li> <p> i t e m ' ' 1 </p></li></ol></doc>
    // pm:0     0   1    2   3 4 5 6 7   8 9   10   11   12     13
    const diff = updateDoc(doc, editor.doc, [
      new ReplaceStep(
        9,
        9,
        new Slice(
          Fragment.from([
            schema.node("list_item", null, [
              schema.node("paragraph", null, []),
            ]),
            schema.node("list_item", null, [
              schema.node("paragraph", null, []),
            ]),
          ]),
          2,
          2,
        ),
      ),
    ])
    assertSplitBlock(diff, ["text", 7], {
      type: "ordered-list-item",
      parents: [],
      attrs: {},
      isEmbed: false,
    })
  })

  it("should emit a splitBlock for a ReplaceStep at the end of a list item", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    const diff = updateDoc(doc, editor.doc, [
      new ReplaceStep(
        11,
        11,
        new Slice(
          Fragment.from(
            schema.node("list_item", { isAmgBlock: false }, [
              schema.node("paragraph", null, []),
            ]),
          ),
          0,
          0,
        ),
      ),
    ])
    assertSplitBlock(diff, ["text", 7], {
      type: "ordered-list-item",
      parents: [],
      attrs: {},
      isEmbed: false,
    })
  })

  it("should emit a splitBlock for a ReplaceStep at the end of a list item containing an explicit paragraph", () => {
    const { editor, doc } = makeDoc([
      { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
      "item 1",
    ])
    const diff = updateDoc(doc, editor.doc, [
      new ReplaceStep(
        9,
        9,
        new Slice(
          Fragment.from([
            schema.node("paragraph", null, []),
            schema.node("paragraph", null, []),
          ]),
          1,
          1,
        ),
      ),
    ])
    assertSplitBlock(diff, ["text", 7], {
      type: "paragraph",
      parents: ["ordered-list-item"],
      attrs: {},
      isEmbed: false,
    })
  })

  it("should emit a splitBlock when a ReplaceStep inserts a list element", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    //am:              0       1 2 3 4  5  6
    //     <doc> <ol> <li> <p> i t e m ' ' 1 </p> </li> </ol> </doc>
    //pm: 0     0    1    2   3 4 5 6 7   8 9   10     11    12     13
    const diff = updateDoc(doc, editor.doc, [
      new ReplaceStep(
        11,
        11,
        new Slice(
          Fragment.from(
            schema.node("list_item", { isAmgBlock: false }, [
              schema.node("paragraph", null, []),
            ]),
          ),
          0,
          0,
        ),
      ),
    ])
    assertSplitBlock(diff, ["text", 7], {
      type: "ordered-list-item",
      parents: [],
      attrs: {},
      isEmbed: false,
    })
  })

  it("should add a mark if the replace step does not match the text at the insertion point", () => {
    const { editor, doc } = makeDoc(["item "])
    updateDoc(doc, editor.doc, [
      new ReplaceStep(
        6,
        6,
        new Slice(
          Fragment.from(schema.text("1", [schema.marks.strong.create()])),
          0,
          0,
        ),
      ),
    ])
    const marks = am.marks(doc, ["text"])
    assert.deepStrictEqual(marks, [
      { start: 5, end: 6, name: "strong", value: true },
    ])
  })

  it("should add link marks with serialized attributes", () => {
    const { editor, doc } = makeDoc(["item "])
    updateDoc(doc, editor.doc, [
      new ReplaceStep(
        6,
        6,
        new Slice(
          Fragment.from(
            schema.text("1", [
              schema.marks.link.create({ href: "http://example.com" }),
            ]),
          ),
          0,
          0,
        ),
      ),
    ])
    const marks = am.marks(doc, ["text"])
    assert.deepStrictEqual(marks, [
      {
        start: 5,
        end: 6,
        name: "link",
        value: JSON.stringify({ href: "http://example.com", title: null }),
      },
    ])
  })
})

describe("when converting addMark steps to a change", () => {
  it("should consolidate consecutive addMark steps", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 2",
    ])
    // Add marks across the text of the two list items
    updateDoc(doc, editor.doc, [
      new AddMarkStep(3, 9, editor.schema.marks.strong.create()),
      new AddMarkStep(13, 19, editor.schema.marks.strong.create()),
    ])
    const marks = am.marks(doc, ["text"])
    assert.deepStrictEqual(marks, [
      { start: 1, end: 14, name: "strong", value: true },
    ])
  })
})
