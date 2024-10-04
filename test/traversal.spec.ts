import { assert } from "chai"
import {
  TraversalEvent,
  amSpliceIdxToPmIdx,
  blockAtIdx,
  pmRangeToAmRange,
  traverseSpans,
  amIdxToPmBlockIdx,
  pmDocFromSpans,
  pmNodeToSpans,
  traverseNode,
  eventsWithIndexChanges,
} from "../src/traversal.js"
import { next as am } from "@automerge/automerge"
import { docFromBlocksNotation, makeDoc } from "./utils.js"
import { AssertionError } from "assert"
import { basicSchemaAdapter } from "../src/basicSchema.js"

describe("the traversal API", () => {
  describe("the amSpliceIdxToPmIdx function", () => {
    it("should return the last prosemirror text index before the given automerge index", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
        "item 1",
      ])
      // am:             0  1 2 3 4  5  6
      //      <ol> <li> <p> i t e m ' ' 1</p> </li> </ol>
      // pm: 0    1    2   3 4 5 6 7   8 9   10    11    12
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 6), 8)
    })

    it("should include the render-only <p> tag in a document with no top level paragraph block", () => {
      const { spans } = docFromBlocksNotation(["hello"])
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 0), 1)
    })

    it("should return the first text index in a document after initial paragraph blocks", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: [], attrs: {} },
        "hello world",
      ])
      // am:   0  1 2 3 4 5  6  7 8 9  10 11
      //      <p> h e l l o ' ' w o r  l  d </p>
      // pm: 0   1 2 3 4 5 6  7  8 9 10 11 12
      //
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 1)
    })

    it("should return a text index after a block idx", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
        "item 1",
      ])
      // am:             0  1 2 3 4  5  6
      //      <ol> <li> <p> i t e m ' ' 1</p> </li> </ol>
      // pm: 0    1    2   3 4 5 6 7   8 9   10    11    12
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 3)
    })

    it("should return a text index inside a render-only node after a block", () => {
      const { spans } = docFromBlocksNotation([
        {
          type: "unordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
      ])
      // am:                            0
      //      <ol> <li> <p> </p> <ul> <li> <p> </p> </li> </ul> </li> </ol>
      // pm: 0    1    2   3    4    5    6   7    8     9     10    11    12
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 0), 3)
    })

    it("should return a text index inside text in a render-only node after a block", () => {
      const { spans } = docFromBlocksNotation([
        {
          type: "unordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:                        0           1 2 3  4   5   6
      //      <ol> <li>  <p> </p> <ul> <li> <p> i t e  m  ' '  1  </p> </li> </ul> </li> </ol>
      // pm: 0    1    2    3    4    5    6   7 8 9 10 11  12  13   14    15   16    17
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 7)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 2), 8)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 4), 10)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 6), 12)
    })

    it("should return the first index in a render-only node after closing parents", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: [], attrs: {} },
        "paragraph",
        {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
      ])
      // am:   0  1 2 3 4 5 6 7 8 9                               10
      //      <p> p a r a g r a p h </p> <ul> <li> <p> </p> <ol> <li> <p> </p> </li> </ol> </li> </ul>
      // pm: 0   1 2 3 4 5 5 6 6 9 10   11   12   13  14   15   16   17  18   19    20    21    22    22
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 1)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 10), 14)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 11), 18)
    })

    it("should return the first index in text in a render-only node after closing parents", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: [], attrs: {} },
        "paragraph",
        {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:   0  1 2 3 4 5 6 7 8 9                               10       11  12 13 14 15   16
      //      <p> p a r a g r a p h </p> <ul> <li> <p> </p> <ol> <li> <p>  i   t  e  m  ' '  1 </p> </li> </ol> </li> </ul>
      // pm: 0   1 2 3 4 5 5 6 6 9 10   11   12   13  14   15   16   17  18 19 20 21  22   23  24  25   26    27    28
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 0), 1)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 10), 14)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 11), 18)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 12), 19)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 16), 23)
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 17), 24)
    })

    it("should return the internal index of an empty paragraph tag", () => {
      const { spans } = docFromBlocksNotation([
        "hello",
        { type: "paragraph", parents: [], attrs: {} },
        { type: "paragraph", parents: [], attrs: {} },
        "world",
      ])
      // am:      0 1 2 3 4       5        6  7  8  9  10 11
      //      <p> h e l l o </p> <p> </p> <p> w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6    7   8    9  10 11 12 13 14 15   16
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 6), 8)
    })

    it("should find the correct index for the last character in a nexted list item", () => {
      const { spans } = docFromBlocksNotation([
        {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:                                  0      1 2 3  4  5  6
      //      <doc> <ul> <li> <p> </p> <ol> <li> <p> i t e  m ' ' 1 </p> </li> </ol> </li> </ul> </doc>
      // pm:       0    1    2   3    4    5    6   7 8 9 10 11 12 13   14   15     16    17    18
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 7), 13)
    })

    it("should find the index after an empty nested list item", () => {
      const { spans } = docFromBlocksNotation([
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item one",
        { type: "ordered-list-item", parents: [], attrs: {} },
        {
          type: "ordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
        "item two",
      ])
      // am:              0       1 2 3 4  5  6  7  8              9                  10      11 12 13 14  15  16
      //      <doc> <ul> <li> <p> i t e m ' ' o  n  e </p> </li> <li> <p> </p> <ol>  <li> <p> i  t  e  m  ' '  2  </p> </li> </ol> </li> </ul> </doc>
      // pm:       0    1    2   3 4 5 6 7   8  9 10 11   12    13   14  15   16   17    18  19 20 21 22 23  24  25   26   27    28    29    30     31
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 10), 15)
    })

    it("should find the index after an embed tag", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("image"),
            parents: [new am.RawString("paragraph")],
            attrs: {
              alt: "Andromeda Galaxy",
              src: new am.RawString(
                "https://archive.org/services/img/Hubble_Andromeda_Galaxy_",
              ),
              title: "Andromeda Galaxy",
            },
            isEmbed: true,
          },
        },
      ]
      // am:         0   1
      //     <doc>  <p> <img src="http://example.com/image.png" /> </p> </doc>
      // pm: 0     0   1                                          2    3      4
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 2), 2)
    })

    it("should find the index inside a lone header tag", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: "heading",
            parents: [],
            attrs: { level: 1 },
          },
        },
      ]
      // am         0
      //     <doc> <h1> </h1> </doc>
      // pm 0     0    1     2
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 1)
    })

    it("should find the first index inside a code block at the start of the document", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("code-block"),
            attrs: {},
            parents: [],
          },
        },
      ]
      assert.equal(amSpliceIdxToPmIdx(basicSchemaAdapter, spans, 1), 1)
    })
  })

  describe("the pmRangeToAmRange function", () => {
    it("should return the automerge text indexes between the given prosemirror indexes", () => {
      const { spans } = makeDoc([
        { type: "paragraph", parents: [], attrs: {} },
        "hello",
      ])
      // am:   0  1 2 3 4 5
      //      <p> h e l l o </p>
      // pm: 0   1 2 3 4 5 6
      //
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 0, to: 6 }),
        {
          start: 0,
          end: 6,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 6 }),
        {
          start: 1,
          end: 6,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 6 }),
        {
          start: 2,
          end: 6,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 5 }),
        {
          start: 2,
          end: 5,
        },
      )
    })

    it("should return the automerge text index before and after the given prosemirror indexes in a nested block", () => {
      const { spans } = makeDoc([
        { type: "unordered-list-item", parents: [], attrs: {} },
        "item 1",
      ])
      // am:        0       1 2 3 4  5  6
      //      <ul> <li> <p> i t e m ' ' 1 </p> </li> </ul>
      // pm: 0    1    2   3 4 5 6 7   8 9   10    11    12
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 0, to: 12 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 12 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 12 }),
        {
          start: 1,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 3, to: 12 }),
        {
          start: 1,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 11 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 10 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 9 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 8 }),
        {
          start: 2,
          end: 6,
        },
      )
    })

    it("should return the automerge text indexes before and after the given prosemirror indexes in a nested block with a render-only wrapper", () => {
      const { spans } = makeDoc([
        {
          type: "unordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:                            0      1 2 3  4  5   6
      //      <ol> <li> <p> </p> <ul> <li> <p> i t e  m ' '  1 </p> </li> </ul> </li> </ol>
      // pm: 0    1    2   3    4    5    6   7 8 9 10 11  12 13   14    15   16    17     18
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 0, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 3, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 5, to: 18 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 6, to: 18 }),
        {
          start: 1,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 7, to: 18 }),
        {
          start: 1,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 18 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 9, to: 18 }),
        {
          start: 3,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 17 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 16 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 15 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 14 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 13 }),
        {
          start: 2,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 12 }),
        {
          start: 2,
          end: 6,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 8, to: 11 }),
        {
          start: 2,
          end: 5,
        },
      )
    })

    it("should return the automerge text indexes before and after the given prosemirror indexes in a document with sibling blocks", () => {
      const { spans } = makeDoc([
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item 1",
        {
          type: "unordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
        "item 2",
      ])
      // am:        0       1 2 3 4  5  6              7       8  9  10 11 12  13
      //      <ol> <li> <p> i t e m ' ' 1  </p> <ul> <li> <p>  i  t  e  m  ' '  2  </p> </li> </ul> </li> </ol>
      // pm: 0    1    2   3 4 5 6 7   8  9    10   11   12  13 14 15 16 17   18 19   20     21   22     23    24

      // Check indices in the first <p>
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 24 }),
        {
          start: 0,
          end: 14,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 9 }),
        {
          start: 0,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 9 }),
        {
          start: 1,
          end: 7,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 8 }),
        {
          start: 1,
          end: 6,
        },
      )

      // Check indices in the second <p>
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 11, to: 24 }),
        {
          start: 7,
          end: 14,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 13, to: 24 }),
        {
          start: 8,
          end: 14,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 12, to: 18 }),
        {
          start: 8,
          end: 13,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 13, to: 18 }),
        {
          start: 8,
          end: 13,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 14, to: 18 }),
        {
          start: 9,
          end: 13,
        },
      )

      ////// check indices which span both <p>s
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 2, to: 19 }),
        {
          start: 1,
          end: 14,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 3, to: 19 }),
        {
          start: 1,
          end: 14,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 18 }),
        {
          start: 2,
          end: 13,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 13 }),
        {
          start: 2,
          end: 8,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 4, to: 12 }),
        {
          start: 2,
          end: 8,
        },
      )
    })

    it("should return the automerge index following the prosemirror index for zero length ranges", () => {
      const { spans } = makeDoc([
        { type: "unordered-list-item", parents: [], attrs: {} },
        {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:               0                  1       2 3 4  4   6   7
      //       <doc> <ul> <li> <p> </p> <ol> <li> <p> i t e  m  ' '  1 </p> </li> </ol> </li> </ul> </doc>
      // pm:        0    1    2   3    4    5    5   7 8 9 10 11   12 13   14   15     16    17    18
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 7, to: 7 }),
        {
          start: 2,
          end: 2,
        },
      )
    })

    it("should return the automerge index in the middle of a paragraph", () => {
      const { spans } = makeDoc(["hello world"])
      // am:      0 1 2 3 4  5  6 7 8  9  10
      //      <p> h e l l o ' ' w o r  l  d  </p>
      // pm: 0   1 2 3 4 5 6   7 8 9 10 11 12
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 7, to: 7 }),
        {
          start: 6,
          end: 6,
        },
      )
    })

    it("should return the automerge index following an empty paragraph", () => {
      const { spans } = makeDoc([
        "hello ",
        { type: "paragraph", parents: [], attrs: {} },
        { type: "paragraph", parents: [], attrs: {} },
        "world",
      ])
      // am:      0 1 2 3 4  5        6        7   8  9  10 11 12
      //      <p> h e l l o ' ' </p> <p> </p> <p>  w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6   7    8   9   10   11 12 13 14 15 16   17
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 9, to: 9 }),
        {
          start: 7,
          end: 7,
        },
      )
    })

    it("should find the correct range for the last character in the document", () => {
      const { spans } = makeDoc(["hello world"])
      // am:      0 1 2 3 4  5  6  7  8  9  10
      //      <p> h e l l o ' ' w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6   7  8  9 10 11 12  13
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 11, to: 12 }),
        {
          start: 10,
          end: 11,
        },
      )
    })

    it("should find the last character in a document with mixed explicit and render-only paragraphs", () => {
      const { spans } = makeDoc([
        "hello world",
        { type: "paragraph", parents: [], attrs: {} },
      ])
      // am:      0 1 2 3 4  5  6  7  8  9  10     11
      //      <p> h e l l o ' ' w  o  r  l  d </p> <p> </p>
      // pm: 0   1 2 3 4 5 6   7  8  9 10 11 12  13   14
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 14, to: 14 }),
        {
          start: 12,
          end: 12,
        },
      )
    })

    it("should return zero length ranges for zero length prosemirror ranges", () => {
      const { spans } = makeDoc([
        "hello ",
        { type: "paragraph", parents: [], attrs: {} },
        "world",
      ])
      // am:      0 1 2 3 4  5        6  7  8  9  10 11
      //      <p> h e l l o ' ' </p> <p> w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6   7    8   9 10 11 12 13 14  15
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 5, to: 5 }),
        {
          start: 4,
          end: 4,
        },
      )
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 9, to: 9 }),
        {
          start: 7,
          end: 7,
        },
      )
    })

    it("should return the correct range for the end of a list item", () => {
      const { spans } = makeDoc([
        {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
        "item 1",
      ])
      // am:                                  0      1 2 3 4  5  6
      //      <doc> <ul> <li> <p> </p> <ol> <li> <p> i t e m ' ' 1 </p> </li> </ol> </li> </ul> </doc>
      // pm: 0     1    2    3   4    5    6    7   8 9 10  11 12 13   14   15     16    17    18
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 13, to: 13 }),
        {
          start: 7,
          end: 7,
        },
      )
    })

    it("should only count embed nodes as a single character", () => {
      const { spans } = makeDoc([
        { type: "paragraph", parents: [], attrs: {} },
        {
          type: "image",
          parents: ["paragraph"],
          attrs: { src: "http://example.com/image.png", isEmbed: true },
        },
      ])

      // am:         0   1
      //      <doc> <p> <img src="http://example.com/image.png" /> </p> </doc>
      // pm: 0     0   1                                          2    3      4
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 2 }),
        {
          start: 1,
          end: 2,
        },
      )
    })

    it("should return the range around bare text", () => {
      const { spans } = makeDoc(["a"])

      // am:      0
      //      <p> a </p>
      // pm: 0   1 2     3
      assert.deepStrictEqual(
        pmRangeToAmRange(basicSchemaAdapter, spans, { from: 1, to: 2 }),
        {
          start: 0,
          end: 1,
        },
      )
    })
  })

  describe("the blockAtIdx function", () => {
    const { spans } = docFromBlocksNotation([
      "hello",
      { type: "paragraph", parents: [], attrs: {} },
      "world",
    ])

    it("should return null if in the initial text", () => {
      assert.isNull(blockAtIdx(spans, 0))
      assert.isNull(blockAtIdx(spans, 2))
      assert.isNull(blockAtIdx(spans, 3))
      assert.isNull(blockAtIdx(spans, 4))
    })

    it("should return the active block on a block boundary", () => {
      assert.deepStrictEqual(blockAtIdx(spans, 5), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
    })

    it("should return the active block after a span boundary", () => {
      assert.deepStrictEqual(blockAtIdx(spans, 6), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 7), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 8), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 9), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 10), {
        index: 5,
        block: { type: new am.RawString("paragraph"), parents: [], attrs: {} },
      })
    })

    it("should return the active block for nested lists", () => {
      const { spans } = docFromBlocksNotation([
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item 1",
      ])
      assert.deepStrictEqual(blockAtIdx(spans, 7), {
        index: 0,
        block: {
          type: new am.RawString("ordered-list-item"),
          parents: [],
          attrs: {},
        },
      })
    })
  })

  describe("the traverseSpans function", () => {
    it("should return a single paragraph for empty spans", () => {
      const spans: am.Span[] = []
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
      ])
    })

    it("should return the correct events for a nested list with inner wrapper", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should return the correct events for two sibling paragraphs", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      const expected: TraversalEvent[] = [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should return the correct events for a paragraph in a list", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
      ]
      assertTraversalEqual(events, expected)
    })

    it("should return the correct events for a paragraph followed by a nested list item", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "paragraph" },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      const expected: TraversalEvent[] = [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "paragraph", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
      ]
      assertTraversalEqual(events, expected)
    })

    it("a list item between two paragraphs", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 3" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 3", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
      ])
    })

    it("a nested list with trailing empty list item", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
      ])
    })

    it("list with trailing empty paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
      ])
    })

    it("a list item with mixed text and nested paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item 2" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
      ])
    })

    it("consecutive text spans", () => {
      const spans: am.Span[] = [
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "hello ", marks: {} },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
      ])
    })

    it("consecutive text spans nested in a list item", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "hello ", marks: {} },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
      ])
    })

    it("creates aside blocks with inner paragraph wrappers", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("aside"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "aside",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "aside", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "aside", role: "explicit" },
      ])
    })

    it("creates heading blocks with the correct attributes", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("heading"),
            parents: [],
            attrs: { level: 1 },
            isEmbed: false,
          },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: {
            type: new am.RawString("heading"),
            parents: [],
            attrs: { level: 2 },
            isEmbed: false,
          },
        },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "heading",
            parents: [],
            attrs: { level: 1 },
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "heading",
            parents: [],
            attrs: { level: 2 },
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
      ])
    })

    it("should infer wrapping paragraph nodes for empty list items before a nested list", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]

      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "ordered_list", role: "render-only" },

        // First block
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },

        // Second block
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },

        { type: "openTag", tag: "ordered_list", role: "render-only" },
        // Third block
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },

        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
      ])
    })

    it("should recognise image spans", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("image"),
            parents: [new am.RawString("paragraph")],
            attrs: {
              src: new am.RawString("image.png"),
              alt: "image alt",
              title: "image title",
            },
            isEmbed: true,
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
            },
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
      ])
    })

    it("should immediately close image tags", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("image"),
            parents: [new am.RawString("paragraph")],
            attrs: {
              src: new am.RawString("image.png"),
              alt: "image alt",
              title: "image title",
            },
            isEmbed: true,
          },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
            },
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
      ])
    })

    it("should construct the correct spans from a list item followed by a paragraph in a blockquote", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [
              new am.RawString("blockquote"),
              new am.RawString("unordered-list-item"),
            ],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
      ])
    })

    it("should generate code_blocks", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("code-block"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "var x" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "code-block",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "code_block", role: "explicit" },
        { type: "text", text: "var x", marks: {} },
        { type: "closeTag", tag: "code_block", role: "explicit" },
      ])
    })

    it("should generate a paragraph in a list item following a header", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("heading"),
            parents: [],
            attrs: { level: 1 },
            isEmbed: false,
          },
        },
        { type: "text", value: "heading" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "some text" },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "heading",
            parents: [],
            attrs: { level: 1 },
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "heading", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "some text", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
      ])
    })

    it("should generate a nested list following a paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "hello world" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item one" },
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
      ]
      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item one", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
      ])
    })
  })

  describe("the traverseNode function", () => {
    const schema = basicSchemaAdapter.schema
    it("should emit block markers for list elements without {isAmgBlock: true} it", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [schema.node("paragraph", null, [])]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should not emit block markers for list elements with any child which has isAmgBlock: true", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: true }, []),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assertTraversalEqual(events, expected)
    })

    it("should not emit block markers for list elements with any descendant that has isAmgBlock: true", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", null, []),
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
            ]),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assertTraversalEqual(events, expected)
    })

    it("should emit block markers for children of list items where the first child does not have isAmgBlock:true but the item has multiple paragraphs", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: false }, []),
            schema.node("paragraph", { isAmgBlock: true }, []),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assertTraversalEqual(events, expected)
    })

    it("should recognise header blocks", () => {
      const node = schema.node("doc", null, [
        schema.node("heading", { level: 1 }, [schema.text("hello")]),
        schema.node("heading", { level: 2 }, [schema.text("world")]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "heading",
            parents: [],
            attrs: { level: 1 },
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "heading",
            parents: [],
            attrs: { level: 2 },
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should recognise image tags", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.node("image", {
            src: "some-image.png",
            alt: "some image",
            title: "some title",
          }),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "image",
            parents: [],
            attrs: {
              src: new am.RawString("some-image.png"),
              alt: "some image",
              title: "some title",
            },
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should recognise text in blockquotes", () => {
      const node = schema.node("doc", null, [
        schema.node("blockquote", null, [schema.node("paragraph", null, [])]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "blockquote",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "blockquote", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "blockquote", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should not emit a block marker for the first paragraph in blockquotes", () => {
      const node = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("paragraph", null, [schema.text("hello")]),
          schema.node("paragraph", null, [schema.text("world")]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "blockquote",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "blockquote", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "blockquote", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("recognises list items in blockquotes", () => {
      const doc = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("bullet_list", null, [
            schema.node("list_item", null, [
              schema.node("paragraph", null, []),
            ]),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, doc))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: ["blockquote"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("recognises list items in a blockquote with paragraphs following", () => {
      const doc = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("bullet_list", null, [
            schema.node("list_item", null, [
              schema.node("paragraph", { isAmgBlock: true }, []),
            ]),
          ]),
          schema.node("paragraph", null, []),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, doc))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should construct a blockquote with two lists separated by a paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [
              new am.RawString("blockquote"),
              new am.RawString("unordered-list-item"),
            ],
            attrs: {},
          },
        },
        { type: "text", value: "some quote" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
        { type: "text", value: "middle" },
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
      ]

      const events = Array.from(traverseSpans(basicSchemaAdapter, spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            isEmbed: false,
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "some quote", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["blockquote"],
            isEmbed: false,
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "middle", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: ["blockquote"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
      ])
    })

    it("should recognise code blocks", () => {
      const node = schema.node("doc", null, [
        schema.node("code_block", null, [schema.text("var x")]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "code-block",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "code_block", role: "explicit" },
        { type: "text", text: "var x", marks: {} },
        { type: "closeTag", tag: "code_block", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should recognise a nested list following a paragraph", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: true }, [
          schema.text("hello world"),
        ]),
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item one"),
            ]),
            schema.node("bullet_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
            ]),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item one", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "unordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should not emit block markers for multiple top level leaf nodes of different types", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.nodes.unknownLeaf.create({
            unknownBlock: {
              type: "unknown",
              parents: [],
              attrs: {},
              isEmbed: true,
            },
          }),
          schema.text("hello"),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: true,
          block: {
            type: "unknown",
            parents: [],
            attrs: {},
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "unknownLeaf", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should not emit parents which are wrapper content", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.node("image", {
            src: "some-image.png",
            alt: "some image",
            title: "some title",
            isAmgBlock: true,
            unknownAttrs: null,
          }),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "image",
            parents: [],
            attrs: {
              src: new am.RawString("some-image.png"),
              alt: "some image",
              title: "some title",
            },
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should emit parents which are wrapper content if they are explicit blocks", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: true }, [
          schema.node("image", {
            src: "some-image.png",
            alt: "some image",
            title: "some title",
            isAmgBlock: true,
            unknownAttrs: null,
          }),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: new am.RawString("some-image.png"),
              alt: "some image",
              title: "some title",
            },
            isEmbed: true,
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should generate block markers when there are insertions inside an unknown block", () => {
      const node = schema.node("doc", null, [
        schema.node("unknownBlock", { unknownParentBlock: "unknown" }, [
          schema.node("paragraph", null, [schema.text("hello")]),
          schema.node(
            "unknownBlock",
            {
              isAmgBlock: true,
              unknownBlock: {
                type: "unknown",
                parents: ["unknown"],
                attrs: {},
                isEmbed: false,
              },
            },
            [schema.node("paragraph", null, [schema.text("world")])],
          ),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: true,
          block: {
            type: "unknown",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "unknownBlock", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          isUnknown: true,
          block: {
            type: "unknown",
            parents: ["unknown"],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "unknownBlock", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "unknownBlock", role: "explicit" },
        { type: "closeTag", tag: "unknownBlock", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should emit block markers for a leading render-only paragraph at the beginning of the doc", () => {
      const doc = schema.node("doc", null, [
        schema.node("paragraph", null, []),
        schema.node("ordered_list", null, [
          schema.node("list_item", { isAmgBlock: true }, [
            schema.node("paragraph", null, []),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(basicSchemaAdapter, doc))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "paragraph",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          isUnknown: false,
          block: {
            type: "ordered-list-item",
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "openTag", tag: "list_item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list_item", role: "explicit" },
        { type: "closeTag", tag: "ordered_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })
  })

  describe("the amIdxToPmBlockIdx function", () => {
    it("should return the index just before the start of a paragraph block", () => {
      const { spans } = docFromBlocksNotation([
        "hello",
        { type: "paragraph", parents: [], attrs: {} },
        "world",
      ])

      // am:      0 1 2 3 4       5  6  7  8  9  10
      //      <p> h e l l o </p> <p> w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6    7   8 9  10 11 12 13   14

      // Everything in the first block should return the position just afte the opening <p>
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 0), 1)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 1), 1)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 2), 1)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 3), 1)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 4), 1)

      // Everything in the second block should return the position just after the second opening <p>
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 5), 8)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 6), 8)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 7), 8)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 8), 8)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 9), 8)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 10), 8)
    })

    it("should return the index just before list items", () => {
      const { spans } = docFromBlocksNotation([
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item 1",
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item 2",
      ])

      // am:          0      1 2 3 4  5  6             7        8  9  10 11  12 13
      //       <ol> <li> <p> i t e m ' ' 1 </p> </li> <li> <p>  i  t  e  m  ' ' 2  </p> </li> </ol>
      // pm: 0     1    2   3 4 5 6 7   8 9   10     11   12  13 14 15 16 17  18 19   20    21    22

      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 0), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 1), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 2), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 3), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 4), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 5), 2)
      assert.equal(amIdxToPmBlockIdx(basicSchemaAdapter, spans, 6), 2)
    })
  })
  describe("the pmDocFromSpans function", () => {
    const schema = basicSchemaAdapter.schema
    it("should construct a documnt with extra render-only paragraphs for nested list items", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("bullet_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", null, []),
                schema.node("ordered_list", null, [
                  schema.node("list_item", { isAmgBlock: true }, [
                    schema.node("paragraph", null, [schema.text("item 1")]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("should return a document with a single list in it for multiple list item spans", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 1")]),
              ]),
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 2")]),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("should work with a list item in the middle of two paragraphs", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 3" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)

      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 1"),
            ]),
            schema.node("ordered_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", { isAmgBlock: true }, [
                  schema.text("item 2"),
                ]),
              ]),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 3"),
            ]),
          ]),
        ),
      )
    })

    it("should allow empty trailing list items", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("ordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
      ]

      const doc = pmDocFromSpans(basicSchemaAdapter, spans)

      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 1"),
            ]),
            schema.node("ordered_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", { isAmgBlock: true }, [
                  schema.text("item 2"),
                ]),
              ]),
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("should work with trailing nested paragraphs", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("paragraph"),
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            parents: [new am.RawString("ordered-list-item")],
            type: new am.RawString("paragraph"),
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("ordered-list-item"),
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("ordered-list-item")],
            attrs: {},
          },
        },
      ]

      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 1"),
            ]),
            schema.node("ordered_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", { isAmgBlock: true }, [
                  schema.text("item 2"),
                ]),
              ]),
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", { isAmgBlock: true }, []),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("a nested list with trailing empty paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("bullet_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 1")]),
                schema.node("paragraph", { isAmgBlock: true }, [
                  schema.text("item 2"),
                ]),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("consecutive ordered and unordered list items", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("unordered-list-item"),
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("ordered-list-item"),
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)

      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("bullet_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 1")]),
              ]),
            ]),
            schema.node("ordered_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, [schema.text("item 2")]),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("constructs asides", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: { type: new am.RawString("aside"), parents: [], attrs: {} },
        },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("aside", { isAmgBlock: true }, [
              schema.node("paragraph", null, []),
            ]),
          ]),
        ),
      )
    })

    it("constructs asides with content", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("paragraph"),
            attrs: {},
          },
        },
        { type: "text", value: "hello world" },
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("paragraph"),
            attrs: {},
          },
        },
        {
          type: "block",
          value: { parents: [], type: new am.RawString("aside"), attrs: {} },
        },
        { type: "text", value: "next line" },
      ]

      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("hello world"),
            ]),
            schema.node("paragraph", { isAmgBlock: true }, []),
            schema.node("aside", { isAmgBlock: true }, [
              schema.node("paragraph", null, [schema.text("next line")]),
            ]),
          ]),
        ),
      )
    })

    it("constructs headers with the correct level", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("heading"),
            attrs: { level: 1 },
          },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: {
            parents: [],
            type: new am.RawString("heading"),
            attrs: { level: 2 },
          },
        },
        { type: "text", value: "world" },
      ]

      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("heading", { isAmgBlock: true, level: 1 }, [
              schema.text("hello"),
            ]),
            schema.node("heading", { isAmgBlock: true, level: 2 }, [
              schema.text("world"),
            ]),
          ]),
        ),
      )
    })

    it("should construct image blocks", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: new am.RawString("image"),
            parents: [new am.RawString("paragraph")],
            attrs: {
              alt: "image alt",
              src: new am.RawString("image.png"),
              title: "image title",
            },
            isEmbed: true,
          },
        },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.node(
                "image",
                {
                  isAmgBlock: true,
                  src: "image.png",
                  alt: "image alt",
                  title: "image title",
                  isEmbed: true,
                },
                [],
              ),
            ]),
          ]),
        ),
      )
    })

    it("should construct blockquotes", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
        { type: "text", value: "world" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("blockquote", null, [
              schema.node("paragraph", { isAmgBlock: true }, [
                schema.text("hello"),
              ]),
              schema.node("paragraph", { isAmgBlock: true }, [
                schema.text("world"),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("should construct a list followed by a paragraph in a blockquote", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: [
              new am.RawString("blockquote"),
              new am.RawString("unordered-list-item"),
            ],
            attrs: {},
          },
        },
        { type: "text", value: "some quote" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("blockquote")],
            attrs: {},
          },
        },
        { type: "text", value: "more quote" },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("blockquote", null, [
              schema.node("bullet_list", null, [
                schema.node("list_item", null, [
                  schema.node("paragraph", { isAmgBlock: true }, [
                    schema.text("some quote"),
                  ]),
                ]),
              ]),
              schema.node("paragraph", { isAmgBlock: true }, [
                schema.text("more quote"),
              ]),
            ]),
          ]),
        ),
      )
    })

    it("should construct a nested list following a paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "hello world" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item one" },
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
      ]

      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      assert.isTrue(
        doc.eq(
          schema.node("doc", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("hello world"),
            ]),
            schema.node("bullet_list", null, [
              schema.node("list_item", null, [
                schema.node("paragraph", { isAmgBlock: true }, [
                  schema.text("item one"),
                ]),
                schema.node("bullet_list", null, [
                  schema.node("list_item", { isAmgBlock: true }, [
                    schema.node("paragraph", null, []),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ),
      )
    })

    describe("when handling unknown blocks", () => {
      it("should render them as the unknown block type", () => {
        const spans: am.Span[] = [
          {
            type: "block",
            value: {
              type: new am.RawString("unknown"),
              parents: [],
              attrs: {},
            },
          },
          { type: "text", value: "hello" },
        ]
        const doc = pmDocFromSpans(basicSchemaAdapter, spans)
        assert.isTrue(
          doc.eq(
            schema.node("doc", null, [
              schema.node(
                "unknownBlock",
                {
                  isAmgBlock: true,
                  unknownBlock: {
                    type: "unknown",
                    parents: [],
                    attrs: {},
                    isEmbed: false,
                  },
                },
                [schema.node("paragraph", null, [schema.text("hello")])],
              ),
            ]),
          ),
        )
      })

      it("should render nested blocks using the unknown block type", () => {
        const spans: am.Span[] = [
          {
            type: "block",
            value: {
              type: new am.RawString("unknown"),
              parents: [new am.RawString("unknown")],
              attrs: {},
            },
          },
          { type: "text", value: "hello" },
        ]
        const doc = pmDocFromSpans(basicSchemaAdapter, spans)
        const expected = schema.node("doc", null, [
          schema.node("unknownBlock", { unknownParentBlock: "unknown" }, [
            schema.node(
              "unknownBlock",
              {
                isAmgBlock: true,
                unknownBlock: {
                  type: "unknown",
                  parents: ["unknown"],
                  attrs: {},
                  isEmbed: false,
                },
              },
              [schema.node("paragraph", null, [schema.text("hello")])],
            ),
          ]),
        ])
        assert.isTrue(doc.eq(expected))
      })
    })
  })

  describe("the pmNodeToSpans function", () => {
    const schema = basicSchemaAdapter.schema
    it("should return the correct blocks for a document with a list containing a paragraph", () => {
      const doc = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item 1"),
            ]),
          ]),
          schema.node("list_item", null, [schema.node("paragraph", null, [])]),
        ]),
      ])
      const blocks = Array.from(pmNodeToSpans(basicSchemaAdapter, doc))
      assert.deepStrictEqual(blocks, [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item 1", marks: {} },
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
      ])
    })

    it("should construct a nested list following a paragraph", () => {
      const doc = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: true }, [
          schema.text("hello world"),
        ]),
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: true }, [
              schema.text("item one"),
            ]),
            schema.node("bullet_list", null, [
              schema.node("list_item", { isAmgBlock: true }, [
                schema.node("paragraph", null, []),
              ]),
            ]),
          ]),
        ]),
      ])
      const blocks = Array.from(pmNodeToSpans(basicSchemaAdapter, doc))
      assert.deepStrictEqual(blocks, [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "hello world", marks: {} },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "item one", marks: {} },
        {
          type: "block",
          value: {
            type: new am.RawString("unordered-list-item"),
            parents: [new am.RawString("unordered-list-item")],
            attrs: {},
            isEmbed: false,
          },
        },
      ])
    })
  })

  it("should return an explicit paragraph for the second paragraph in a list item", () => {
    const schema = basicSchemaAdapter.schema
    const doc = schema.node("doc", null, [
      schema.node("bullet_list", null, [
        schema.node("list_item", null, [
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("item 1"),
          ]),
          schema.node("paragraph", null, []),
        ]),
      ]),
    ])
    const blocks = Array.from(pmNodeToSpans(basicSchemaAdapter, doc))
    assert.deepStrictEqual(blocks, [
      {
        type: "block",
        value: {
          type: new am.RawString("paragraph"),
          parents: [new am.RawString("unordered-list-item")],
          attrs: {},
          isEmbed: false,
        },
      },
      { type: "text", value: "item 1", marks: {} },
      {
        type: "block",
        value: {
          type: new am.RawString("paragraph"),
          parents: [new am.RawString("unordered-list-item")],
          attrs: {},
          isEmbed: false,
        },
      },
    ])
  })

  describe("when handling unknown block types", () => {
    it("should round trip the block type", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unknown"),
            parents: [],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "hello", marks: {} },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })

    it("should round trip the isEmbed state", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unknown"),
            parents: [],
            attrs: {},
            isEmbed: true,
          },
        },
        { type: "text", value: "hello", marks: {} },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })

    it("should round trip nested unknown blocks", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("unknown"),
            parents: [new am.RawString("unknown")],
            attrs: {},
            isEmbed: false,
          },
        },
        { type: "text", value: "hello", marks: {} },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })
  })

  describe("when handling unknown attributes of known blocks", () => {
    it("should round trip them through the editor", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {
              foo: "bar",
            },
            isEmbed: false,
          },
        },
        { type: "text", value: "hello", marks: {} },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })

    it("should round trip unknown attributes of known embed blocks through the editor", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: new am.RawString("image"),
            parents: [],
            attrs: {
              src: new am.RawString("image.png"),
              alt: null,
              title: null,
            },
            isEmbed: true,
          },
        },
        { type: "text", value: "hello", marks: {} },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })
  })

  describe("when handling unknown marks", () => {
    it("should round trip them through the editor", () => {
      const date = new Date()
      const spans: am.Span[] = [
        {
          type: "text",
          value: "hello",
          marks: {
            unknownBool: true,
            unknownString: "hello",
            unknownNumber: 1,
            unknownDate: date,
          },
        },
      ]
      const doc = pmDocFromSpans(basicSchemaAdapter, spans)
      const blocks: am.Span[] = Array.from(
        pmNodeToSpans(basicSchemaAdapter, doc),
      )
      assert.deepStrictEqual(blocks, spans)
    })
  })
})

function assertTraversalEqual(
  actual: TraversalEvent[],
  expected: TraversalEvent[],
) {
  if (actual.length === expected.length) {
    if (
      actual.every((event, i) => {
        try {
          assert.deepStrictEqual(event, expected[i])
          return true
        } catch (e) {
          return false
        }
      })
    ) {
      return true
    }
  }

  const expectedEvents = expected.map(printEvent)
  const actualEvents = actual.map(printEvent)

  throw new AssertionError({
    message: "traversals didn't match",
    expected: expectedEvents,
    actual: actualEvents,
  })
}

function printEvent(event: TraversalEvent): string {
  if (event.type === "openTag") {
    if (event.role === "explicit") {
      return `<${event.tag} explicit>`
    }
    return `<${event.tag}>`
  } else if (event.type === "closeTag") {
    if (event.role === "explicit") {
      return `</${event.tag} explicit>`
    }
    return `</${event.tag}>`
  } else if (event.type === "leafNode") {
    return `<${event.tag} />`
  } else if (event.type === "text") {
    return `text: ${event.text}`
  } else if (event.type === "block") {
    return `block: ${JSON.stringify(event.block)}`
  } else {
    return "unknown"
  }
}

export function printIndexTableForSpans(spans: am.Span[]): string {
  return printIndexTable(traverseSpans(basicSchemaAdapter, spans))
}

export function printIndexTable(
  events: IterableIterator<TraversalEvent>,
): string {
  let eventColWidth = "event".length
  let amIdxColWidth = "amIdx".length
  let pmIdxColWidth = "pmIdx".length
  const rows = Array.from(eventsWithIndexChanges(events)).map(
    ({ event, after }) => {
      const eventCol = printEvent(event)
      eventColWidth = Math.max(eventColWidth, eventCol.length)
      const amIdxCol = after.amIdx.toString()
      amIdxColWidth = Math.max(amIdxColWidth, amIdxCol.length)
      const pmIdxCol = after.pmIdx.toString()
      pmIdxColWidth = Math.max(pmIdxColWidth, pmIdxCol.length)
      return { eventCol, amIdxCol, pmIdxCol }
    },
  )
  const header = `| ${"event".padEnd(eventColWidth)} | ${"amIdx".padEnd(amIdxColWidth)} | ${"pmIdx".padEnd(pmIdxColWidth)} |`
  const divider = `| ${"-".repeat(eventColWidth)} | ${"-".repeat(amIdxColWidth)} | ${"-".repeat(pmIdxColWidth)} |`
  const body = rows
    .map(
      row =>
        `| ${row.eventCol.padEnd(eventColWidth)} | ${row.amIdxCol.padEnd(amIdxColWidth)} | ${row.pmIdxCol.padEnd(pmIdxColWidth)} |`,
    )
    .join("\n")
  return `${header}\n${divider}\n${body}`
}
