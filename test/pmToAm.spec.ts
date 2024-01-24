import { assert } from "chai"
import { Fragment, Slice, Node } from "prosemirror-model"
import { makeDoc, printTree } from "./utils"
import { ReplaceStep, Step } from "prosemirror-transform"
import { default as pmToAm } from "../src/pmToAm"
import { next as am } from "@automerge/automerge"
import { schema } from "../src/schema"

describe("when converting a ReplaceStep to a change", () => {
  function updateDoc(
    amDoc: am.Doc<unknown>,
    pmDoc: Node,
    step: Step,
  ): am.Patch[] {
    const heads = am.getHeads(amDoc)
    const spans = am.spans(amDoc, ["text"])
    const updatedDoc = am.change(amDoc, d => {
      pmToAm(spans, step, d, pmDoc, "text")
    })
    return am.diff(amDoc, heads, am.getHeads(updatedDoc))
  }

  it("should convert a <li></li> ReplaceStep in a list item to a splitblock", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    // am:            0    1  2 3 4  5  6
    //     <doc><ol> <li> <p> i t e m ' ' 1 </p></li></ol></doc>
    // pm:0     0   1    2   3 4 5 6 7   8 9   10   11   12     13
    const diff = updateDoc(
      doc,
      editor.doc,
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
    )
    assert.deepOwnInclude(diff[0], {
      action: "splitBlock",
      index: 7,
      type: "ordered-list-item",
      parents: [],
      path: ["text", 7],
    })
  })

  it("should emit a splitBlock for a ReplaceStep at the end of a list item", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    const diff = updateDoc(
      doc,
      editor.doc,
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
    )
    assert.deepOwnInclude(diff[0], {
      action: "splitBlock",
      index: 7,
      type: "ordered-list-item",
      parents: [],
      path: ["text", 7],
    })
  })

  it("should emit a splitBlock for a ReplaceStep at the end of a list item containing an explicit paragraph", () => {
    const { editor, doc } = makeDoc([
      { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
      "item 1",
    ])
    const diff = updateDoc(
      doc,
      editor.doc,
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
    )
    assert.equal(diff.length, 1)
    assert.deepOwnInclude(diff[0], {
      action: "splitBlock",
      index: 7,
      type: "paragraph",
      parents: ["ordered-list-item"],
      path: ["text", 7],
    })
  })

  it("should emit a joinBlock when a ReplaceStep closes an ordered list", () => {
    const { editor, doc } = makeDoc([
      { type: "ordered-list-item", parents: [], attrs: {} },
      "item 1",
    ])
    const diff = updateDoc(
      doc,
      editor.doc,
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
    )
    console.log(diff)
    assert.deepOwnInclude(diff[0], {
      action: "splitBlock",
      index: 7,
      type: "ordered-list-item",
      parents: [],
      path: ["text", 7],
    })
  })
})
