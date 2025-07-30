import { Fragment, Slice, Node } from "prosemirror-model"
import { assertSplitBlock, makeDoc } from "./utils.js"
import {
  AddMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  Step,
} from "prosemirror-transform"
import { default as pmToAm } from "../src/pmToAm.js"
import { next as am } from "@automerge/automerge"
import { assert } from "chai"
import { pmDocFromSpans } from "../src/traversal.js"
import { EditorState } from "prosemirror-state"
import { basicSchemaAdapter } from "../src/basicSchema.js"
import { ImmutableString } from "@automerge/automerge-repo"

const schema = basicSchemaAdapter.schema

function updateDoc(
  amDoc: am.Doc<unknown>,
  pmDoc: Node,
  steps: Step[],
): { diff: am.Patch[]; updatedDoc: am.Doc<unknown> } {
  const heads = am.getHeads(amDoc)
  const spans = am.spans(amDoc, ["text"])
  const updatedDoc = am.change(amDoc, d => {
    pmToAm(basicSchemaAdapter, spans, steps, d, pmDoc, ["text"])
  })
  return {
    diff: am.diff(amDoc, heads, am.getHeads(updatedDoc)),
    updatedDoc,
  }
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
    const { diff } = updateDoc(doc, editor.doc, [
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
    const { diff } = updateDoc(doc, editor.doc, [
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
    const { diff } = updateDoc(doc, editor.doc, [
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
    const { diff } = updateDoc(doc, editor.doc, [
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

  it("should preserve unknown marks", () => {
    let doc = am.from({ text: "hello world" })
    doc = am.change(doc, d => {
      am.mark(
        d,
        ["text"],
        { start: 3, end: 6, expand: "both" },
        "specialMark",
        true,
      )
    })
    const spans = am.spans(doc, ["text"])
    const pmDoc = pmDocFromSpans(basicSchemaAdapter, spans)
    const editor = EditorState.create({ schema, doc: pmDoc })
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
    const marksByType: { [key: string]: am.Mark[] } = {}
    for (const mark of marks) {
      if (!marksByType[mark.name]) {
        marksByType[mark.name] = []
      }
      marksByType[mark.name].push(mark)
    }
    assert.deepStrictEqual(marksByType, {
      specialMark: [{ start: 3, end: 7, name: "specialMark", value: true }],
      strong: [{ start: 5, end: 6, name: "strong", value: true }],
    })
  })

  describe("expand configuration", () => {
    // These tests all make use of the fact that the basicSchemaAdapter is
    // configured with bold spans which are inclusive (in prosemirror terms)
    // and link spans which are not inclusive. These tests check that the
    // automerge expand configuration is correctly inferred from the schema.

    it("should use the mark expand configuration from the schema", () => {
      // We use ProseMirror to insert a range which has both a bold and link
      // mark on it, then use Automerge to splice a character following this
      // range and check that only the bold mark expands
      const { editor, doc } = makeDoc(["text"])

      // First make an insertion which adds marks
      let { updatedDoc } = updateDoc(doc, editor.doc, [
        new ReplaceStep(
          1,
          1,
          new Slice(
            Fragment.from(
              editor.schema.text("1", [
                editor.schema.marks.strong.create(),
                editor.schema.marks.link.create({
                  href: "https://example.com",
                }),
              ]),
            ),
            0,
            0,
          ),
        ),
      ])

      // Now, insert into the automerge document after the initial character
      updatedDoc = am.change(updatedDoc, d =>
        am.splice(d as am.Doc<unknown>, ["text"], 1, 0, "2"),
      )

      const spans = am.spans(updatedDoc, ["text"])
      // Here we expect the bold span to expand, because it's configured to do so
      // in the schema, and the link span to not expand as it's configured to not
      // expand
      assert.deepStrictEqual(spans, [
        {
          marks: {
            link: JSON.stringify({ href: "https://example.com", title: null }),
            strong: true,
          },
          type: "text",
          value: "1",
        },
        {
          marks: {
            strong: true,
          },
          type: "text",
          value: "2",
        },
        {
          type: "text",
          value: "text",
        },
      ])
    })
  })

  it("should use the correct mark config when performing more complex ReplaceSteps", () => {
    // In this test we make a slightly more complex change which replaces some existing content
    // with new blocks. This means that in the implementation we don't use splice but instead
    // use updateSpans.
    const { editor, doc } = makeDoc(["item 1"])

    // Use ProseMirror to replace the entire document with a paragraph
    // containing the text "item one" with both strong and link marks
    let { updatedDoc } = updateDoc(doc, editor.doc, [
      new ReplaceStep(
        0,
        8,
        new Slice(
          Fragment.from(
            schema.node("ordered_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", null, [
                  schema.text("item one", [
                    editor.schema.marks.strong.create(),
                    editor.schema.marks.link.create({
                      href: "https://example.com",
                    }),
                  ]),
                ]),
              ]),
            ]),
          ),
          0,
          0,
        ),
      ),
    ])

    // Now use Automerge to splice the text 'two' following the marked text we
    // just created
    updatedDoc = am.change(updatedDoc, d => {
      am.splice(d as any, ["text"], 9, 0, "two")
    })
    const spans = am.spans(updatedDoc, ["text"])

    // Here bold should expand as it is inclusive (in prosemirror terms) whilst
    // the link span should not expand as it is not inclusive
    assert.deepStrictEqual(spans, [
      {
        type: "block",
        value: {
          attrs: {},
          isEmbed: false,
          parents: [],
          type: new ImmutableString("ordered-list-item"),
        },
      },
      {
        marks: {
          link: '{"href":"https://example.com","title":null}',
          strong: true,
        },
        type: "text",
        value: "item one",
      },
      {
        marks: {
          strong: true,
        },
        type: "text",
        value: "two",
      },
    ])
  })

  it("should use the correct mark config when performing ReplaceAroundSteps", () => {
    // In this test we create a `ReplaceAroundStep` which again fires the updateSpans
    // logic in the plugin
    const { editor, doc } = makeDoc(["item one"])

    // Insert <paragraph>intro</paragraph> into the document and move the
    // existing content to occur after this paragraph. The newly inserted
    // paragraph has a link and strong mark on it.
    let { updatedDoc } = updateDoc(doc, editor.doc, [
      new ReplaceAroundStep(
        0,
        10,
        1,
        9,
        new Slice(
          Fragment.from([
            schema.node("paragraph", null, [
              schema.text("intro", [
                editor.schema.marks.strong.create(),
                editor.schema.marks.link.create({
                  href: "https://example.com",
                }),
              ]),
            ]),
          ]),
          0,
          0,
        ),
        6,
      ),
    ])

    // Now use automerge to insert the text "middle" in the paragraph we just inserted
    updatedDoc = am.change(updatedDoc, d => {
      am.splice(d as any, ["text"], 5, 0, "middle")
    })
    const spans = am.spans(updatedDoc, ["text"])

    // Here bold should expand as it is inclusive (in prosemirror terms) whilst
    // the link span should not expand as it is not inclusive
    assert.deepStrictEqual(spans, [
      {
        marks: {
          link: '{"href":"https://example.com","title":null}',
          strong: true,
        },
        type: "text",
        value: "intro",
      },
      {
        marks: {
          strong: true,
        },
        type: "text",
        value: "middle",
      },
      {
        type: "text",
        value: "item one",
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
