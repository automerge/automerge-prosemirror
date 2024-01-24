import { assert } from "chai"
import {
  TraversalEvent,
  amSpliceIdxToPmIdx,
  blockAtIdx,
  pmRangeToAmRange,
  traverseSpans,
  amIdxToPmBlockIdx,
  docFromSpans,
  blocksFromNode,
  blockDiff,
  traverseNode,
  eventsWithIndexChanges,
} from "../src/traversal"
import { next as am } from "@automerge/automerge"
import { docFromBlocksNotation, makeDoc } from "./utils"
import { schema } from "../src/schema"
import { AssertionError } from "assert"

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
      assert.equal(amSpliceIdxToPmIdx(spans, 6), 8)
    })

    it("should include the render-only <p> tag in a document with no top level paragraph block", () => {
      const { spans } = docFromBlocksNotation(["hello"])
      assert.equal(amSpliceIdxToPmIdx(spans, 0), 1)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 1), 1)
    })

    it("should return a text index after a block idx", () => {
      const { spans } = docFromBlocksNotation([
        { type: "paragraph", parents: ["ordered-list-item"], attrs: {} },
        "item 1",
      ])
      // am:             0  1 2 3 4  5  6
      //      <ol> <li> <p> i t e m ' ' 1</p> </li> </ol>
      // pm: 0    1    2   3 4 5 6 7   8 9   10    11    12
      assert.equal(amSpliceIdxToPmIdx(spans, 1), 3)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 0), 3)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 1), 7)
      assert.equal(amSpliceIdxToPmIdx(spans, 2), 8)
      assert.equal(amSpliceIdxToPmIdx(spans, 4), 10)
      assert.equal(amSpliceIdxToPmIdx(spans, 6), 12)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 1), 1)
      assert.equal(amSpliceIdxToPmIdx(spans, 10), 14)
      assert.equal(amSpliceIdxToPmIdx(spans, 11), 18)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 0), 1)
      assert.equal(amSpliceIdxToPmIdx(spans, 10), 14)
      assert.equal(amSpliceIdxToPmIdx(spans, 11), 18)
      assert.equal(amSpliceIdxToPmIdx(spans, 12), 19)
      assert.equal(amSpliceIdxToPmIdx(spans, 16), 23)
      assert.equal(amSpliceIdxToPmIdx(spans, 17), 24)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 6), 8)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 7), 13)
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
      assert.equal(amSpliceIdxToPmIdx(spans, 10), 15)
    })

    it("should find the index after an embed tag", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              isEmbed: true,
              alt: "Andromeda Galaxy",
              src: "https://archive.org/services/img/Hubble_Andromeda_Galaxy_",
              title: "Andromeda Galaxy",
            },
          },
        },
      ]
      // am:         0   1
      //     <doc>  <p> <img src="http://example.com/image.png" /> </p> </doc>
      // pm: 0     0   1                                          2    3      4
      assert.equal(amSpliceIdxToPmIdx(spans, 2), 2)
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 0, to: 6 }), {
        start: 0,
        end: 6,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 6 }), {
        start: 1,
        end: 6,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 6 }), {
        start: 2,
        end: 6,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 5 }), {
        start: 2,
        end: 5,
      })
    })

    it("should return the automerge text index before and after the given prosemirror indexes in a nested block", () => {
      const { spans } = makeDoc([
        { type: "unordered-list-item", parents: [], attrs: {} },
        "item 1",
      ])
      // am:        0       1 2 3 4  5  6
      //      <ul> <li> <p> i t e m ' ' 1 </p> </li> </ul>
      // pm: 0    1    2   3 4 5 6 7   8 9   10    11    12
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 0, to: 12 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 12 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 12 }), {
        start: 1,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 3, to: 12 }), {
        start: 1,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 11 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 10 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 9 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 8 }), {
        start: 2,
        end: 6,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 0, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 3, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 5, to: 18 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 6, to: 18 }), {
        start: 1,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 7, to: 18 }), {
        start: 1,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 18 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 9, to: 18 }), {
        start: 3,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 17 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 16 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 15 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 14 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 13 }), {
        start: 2,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 12 }), {
        start: 2,
        end: 6,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 8, to: 11 }), {
        start: 2,
        end: 5,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 24 }), {
        start: 0,
        end: 14,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 9 }), {
        start: 0,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 9 }), {
        start: 1,
        end: 7,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 8 }), {
        start: 1,
        end: 6,
      })

      // Check indices in the second <p>
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 11, to: 24 }), {
        start: 7,
        end: 14,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 13, to: 24 }), {
        start: 8,
        end: 14,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 12, to: 18 }), {
        start: 8,
        end: 13,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 13, to: 18 }), {
        start: 8,
        end: 13,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 14, to: 18 }), {
        start: 9,
        end: 13,
      })

      ////// check indices which span both <p>s
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 2, to: 19 }), {
        start: 1,
        end: 14,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 3, to: 19 }), {
        start: 1,
        end: 14,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 18 }), {
        start: 2,
        end: 13,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 13 }), {
        start: 2,
        end: 8,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 4, to: 12 }), {
        start: 2,
        end: 8,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 7, to: 7 }), {
        start: 2,
        end: 2,
      })
    })

    it("should return the automerge index in the middle of a paragraph", () => {
      const { spans } = makeDoc(["hello world"])
      // am:      0 1 2 3 4  5  6 7 8  9  10
      //      <p> h e l l o ' ' w o r  l  d  </p>
      // pm: 0   1 2 3 4 5 6   7 8 9 10 11 12
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 7, to: 7 }), {
        start: 6,
        end: 6,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 9, to: 9 }), {
        start: 7,
        end: 7,
      })
    })

    it("should find the correct range for the last character in the document", () => {
      const { spans } = makeDoc(["hello world"])
      // am:      0 1 2 3 4  5  6  7  8  9  10
      //      <p> h e l l o ' ' w  o  r  l  d </p>
      // pm: 0   1 2 3 4 5 6   7  8  9 10 11 12  13
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 11, to: 12 }), {
        start: 10,
        end: 11,
      })
    })

    it("should find the last character in a document with mixed explicit and render-only paragraphs", () => {
      const { spans } = makeDoc([
        "hello world",
        { type: "paragraph", parents: [], attrs: {} },
      ])
      // am:      0 1 2 3 4  5  6  7  8  9  10     11
      //      <p> h e l l o ' ' w  o  r  l  d </p> <p> </p>
      // pm: 0   1 2 3 4 5 6   7  8  9 10 11 12  13   14
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 14, to: 14 }), {
        start: 12,
        end: 12,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 5, to: 5 }), {
        start: 4,
        end: 4,
      })
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 9, to: 9 }), {
        start: 7,
        end: 7,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 13, to: 13 }), {
        start: 7,
        end: 7,
      })
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
      assert.deepStrictEqual(pmRangeToAmRange(spans, { from: 1, to: 2 }), {
        start: 1,
        end: 2,
      })
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
        block: { type: "paragraph", parents: [], attrs: {} },
      })
    })

    it("should return the active block after a span boundary", () => {
      assert.deepStrictEqual(blockAtIdx(spans, 6), {
        index: 5,
        block: { type: "paragraph", parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 7), {
        index: 5,
        block: { type: "paragraph", parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 8), {
        index: 5,
        block: { type: "paragraph", parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 9), {
        index: 5,
        block: { type: "paragraph", parents: [], attrs: {} },
      })
      assert.deepStrictEqual(blockAtIdx(spans, 10), {
        index: 5,
        block: { type: "paragraph", parents: [], attrs: {} },
      })
    })

    it("should return the active block for nested lists", () => {
      const { spans } = docFromBlocksNotation([
        { type: "ordered-list-item", parents: [], attrs: {} },
        "item 1",
      ])
      assert.deepStrictEqual(blockAtIdx(spans, 7), {
        index: 0,
        block: { type: "ordered-list-item", parents: [], attrs: {} },
      })
    })
  })

  describe("the traverseSpans function", () => {
    it("should return a single paragraph for empty spans", () => {
      const spans: am.Span[] = []
      const events = Array.from(traverseSpans(spans))
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
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
      ]
      const events = Array.from(traverseSpans(spans))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        {
          type: "block",
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
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
      const events = Array.from(traverseSpans(spans))
      const expected: TraversalEvent[] = [
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
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
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(spans))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should return the correct events for a paragraph followed by a nested list item", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "paragraph" },
        {
          type: "block",
          value: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
      ]
      const events = Array.from(traverseSpans(spans))
      const expected: TraversalEvent[] = [
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "paragraph", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        {
          type: "block",
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("a list item between two paragraphs", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 3" },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 3", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
      ])
    })

    it("a nested list with trailing empty list item", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        {
          type: "block",
          block: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
      ])
    })

    it("list with trailing empty paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "ordered-list", role: "render-only" },
        {
          type: "block",
          block: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
      ])
    })

    it("a list item with mixed text and nested paragraph", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: { type: "unordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        {
          type: "block",
          block: { type: "unordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
      ])
    })

    it("consecutive text spans", () => {
      const spans: am.Span[] = [
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
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
          value: { type: "unordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        {
          type: "block",
          block: { type: "unordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "hello ", marks: {} },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
      ])
    })

    it("creates aside blocks with inner paragraph wrappers", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "aside", parents: [], attrs: {} } },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "block", block: { type: "aside", parents: [], attrs: {} } },
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
          value: { type: "heading", parents: [], attrs: { level: 1 } },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: { type: "heading", parents: [], attrs: { level: 2 } },
        },
        { type: "text", value: "world" },
      ]
      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        {
          type: "block",
          block: { type: "heading", parents: [], attrs: { level: 1 } },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        {
          type: "block",
          block: { type: "heading", parents: [], attrs: { level: 2 } },
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
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        {
          type: "block",
          value: {
            type: "ordered-list-item",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]

      const events = Array.from(traverseSpans(spans))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "ordered-list", role: "render-only" },

        // First block
        {
          type: "block",
          block: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 1", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },

        // Second block
        {
          type: "block",
          block: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },

        { type: "openTag", tag: "ordered-list", role: "render-only" },
        // Third block
        {
          type: "block",
          block: {
            type: "ordered-list-item",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "text", text: "item 2", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },

        { type: "closeTag", tag: "ordered-list", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "ordered-list", role: "render-only" },
      ])
    })

    it("should recognise image spans", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
              isEmbed: true,
            },
          },
        },
      ]
      const events = Array.from(traverseSpans(spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
              isEmbed: true,
            },
          },
        },
        { type: "leafNode", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
      ])
    })

    it("should immediately close image tags", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        {
          type: "block",
          value: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
              isEmbed: true,
            },
          },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(spans))
      assertTraversalEqual(events, [
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "image.png",
              alt: "image alt",
              title: "image title",
              isEmbed: true,
            },
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
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        {
          type: "block",
          value: { type: "paragraph", parents: ["blockquote"], attrs: {} },
        },
        { type: "text", value: "hello" },
      ]
      const events = Array.from(traverseSpans(spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
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
          value: { type: "code-block", parents: [], attrs: {} },
        },
        { type: "text", value: "var x" },
      ]
      const events = Array.from(traverseSpans(spans))
      assertTraversalEqual(events, [
        {
          type: "block",
          block: { type: "code-block", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "code_block", role: "explicit" },
        { type: "text", text: "var x", marks: {} },
        { type: "closeTag", tag: "code_block", role: "explicit" },
      ])
    })
  })

  describe("the traverseNode function", () => {
    it("should infer the isAmgBlock attribute for list elements without it", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [schema.node("paragraph", null, [])]),
        ]),
      ])
      const events = Array.from(traverseNode(node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          block: { type: "unordered-list-item", parents: [], attrs: {} },
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

    it("should not infer the isAmgBlock attribute for list elements wihtout it but who first child has it", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: true }, []),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should not infer the isAmgBlock attribute for list elements without it but which has any descendant that does have it", () => {
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
      const events = Array.from(traverseNode(node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "openTag", tag: "ordered_list", role: "render-only" },
        {
          type: "block",
          block: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
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
      assert.deepStrictEqual(events, expected)
    })

    it("should infer the isAmgBlock attribute for children of list items where the first child does not have it but the item has multiple paragraphs", () => {
      const node = schema.node("doc", null, [
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [
            schema.node("paragraph", { isAmgBlock: false }, []),
            schema.node("paragraph", { isAmgBlock: true }, []),
          ]),
        ]),
      ])
      const events = Array.from(traverseNode(node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should recognise header blocks", () => {
      const node = schema.node("doc", null, [
        schema.node("heading", { level: 1 }, [schema.text("hello")]),
        schema.node("heading", { level: 2 }, [schema.text("world")]),
      ])
      const events = Array.from(traverseNode(node))
      const expected: TraversalEvent[] = [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          block: { type: "heading", parents: [], attrs: { level: 1 } },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        {
          type: "block",
          block: { type: "heading", parents: [], attrs: { level: 2 } },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ]
      assert.deepStrictEqual(events, expected)
    })

    it("should add the isAmgBlock: true attribute to a leading paragraph if there is following block content", () => {
      const node = schema.node("doc", null, [
        schema.node("paragraph", null, []),
        schema.node("heading", { level: 1 }, [schema.text("hello")]),
      ])
      const events = Array.from(traverseNode(node))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "block", block: { type: "paragraph", parents: [], attrs: {} } },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          block: { type: "heading", parents: [], attrs: { level: 1 } },
        },
        { type: "openTag", tag: "heading", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "heading", role: "explicit" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
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
      const events = Array.from(traverseNode(node))
      assert.deepStrictEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        {
          type: "block",
          block: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              src: "some-image.png",
              alt: "some image",
              title: "some title",
              isEmbed: true,
            },
          },
        },
        { type: "openTag", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "image", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should recognise text in blockquotes", () => {
      const node = schema.node("doc", null, [
        schema.node("blockquote", null, [schema.node("paragraph", null, [])]),
      ])
      const events = Array.from(traverseNode(node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
        { type: "closeTag", tag: "doc", role: "render-only" },
      ])
    })

    it("should recognise paragraphs in blockquotes", () => {
      const node = schema.node("doc", null, [
        schema.node("blockquote", null, [
          schema.node("paragraph", null, [schema.text("hello")]),
          schema.node("paragraph", null, [schema.text("world")]),
        ]),
      ])
      const events = Array.from(traverseNode(node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "hello", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "world", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
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
      const events = Array.from(traverseNode(doc))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          block: {
            type: "unordered-list-item",
            parents: ["blockquote"],
            attrs: {},
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
      const events = Array.from(traverseNode(doc))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "bullet_list", role: "render-only" },
        { type: "openTag", tag: "list_item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list_item", role: "render-only" },
        { type: "closeTag", tag: "bullet_list", role: "render-only" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
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
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "some quote" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
          },
        },
        { type: "text", value: "middle" },
        {
          type: "block",
          value: {
            type: "unordered-list-item",
            parents: ["blockquote"],
            attrs: {},
          },
        },
      ]

      const events = Array.from(traverseSpans(spans))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "blockquote", role: "render-only" },
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        { type: "openTag", tag: "list-item", role: "render-only" },
        {
          type: "block",
          block: {
            type: "paragraph",
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "some quote", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "closeTag", tag: "list-item", role: "render-only" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
        {
          type: "block",
          block: { type: "paragraph", parents: ["blockquote"], attrs: {} },
        },
        { type: "openTag", tag: "paragraph", role: "explicit" },
        { type: "text", text: "middle", marks: {} },
        { type: "closeTag", tag: "paragraph", role: "explicit" },
        { type: "openTag", tag: "unordered-list", role: "render-only" },
        {
          type: "block",
          block: {
            type: "unordered-list-item",
            parents: ["blockquote"],
            attrs: {},
          },
        },
        { type: "openTag", tag: "list-item", role: "explicit" },
        { type: "openTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "paragraph", role: "render-only" },
        { type: "closeTag", tag: "list-item", role: "explicit" },
        { type: "closeTag", tag: "unordered-list", role: "render-only" },
        { type: "closeTag", tag: "blockquote", role: "render-only" },
      ])
    })

    it("should recognise code blocks", () => {
      const node = schema.node("doc", null, [
        schema.node("code_block", null, [schema.text("var x")]),
      ])
      const events = Array.from(traverseNode(node))
      assertTraversalEqual(events, [
        { type: "openTag", tag: "doc", role: "render-only" },
        {
          type: "block",
          block: { type: "code-block", parents: [], attrs: {} },
        },
        { type: "openTag", tag: "code_block", role: "explicit" },
        { type: "text", text: "var x", marks: {} },
        { type: "closeTag", tag: "code_block", role: "explicit" },
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
      assert.equal(amIdxToPmBlockIdx(spans, 0), 1)
      assert.equal(amIdxToPmBlockIdx(spans, 1), 1)
      assert.equal(amIdxToPmBlockIdx(spans, 2), 1)
      assert.equal(amIdxToPmBlockIdx(spans, 3), 1)
      assert.equal(amIdxToPmBlockIdx(spans, 4), 1)

      // Everything in the second block should return the position just after the second opening <p>
      assert.equal(amIdxToPmBlockIdx(spans, 5), 8)
      assert.equal(amIdxToPmBlockIdx(spans, 6), 8)
      assert.equal(amIdxToPmBlockIdx(spans, 7), 8)
      assert.equal(amIdxToPmBlockIdx(spans, 8), 8)
      assert.equal(amIdxToPmBlockIdx(spans, 9), 8)
      assert.equal(amIdxToPmBlockIdx(spans, 10), 8)
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

      assert.equal(amIdxToPmBlockIdx(spans, 0), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 1), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 2), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 3), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 4), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 5), 2)
      assert.equal(amIdxToPmBlockIdx(spans, 6), 2)
    })
  })
  describe("the docFromSpans function", () => {
    it("should construct a documnt with extra render-only paragraphs for nested list items", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            type: "ordered-list-item",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 1" },
      ]
      const doc = docFromSpans(spans)
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
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = docFromSpans(spans)
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
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 3" },
      ]
      const doc = docFromSpans(spans)

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
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
      ]

      const doc = docFromSpans(spans)

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
        { type: "block", value: { parents: [], type: "paragraph", attrs: {} } },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            parents: ["ordered-list-item"],
            type: "paragraph",
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
        {
          type: "block",
          value: { parents: [], type: "ordered-list-item", attrs: {} },
        },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
      ]

      const doc = docFromSpans(spans)
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
          value: { type: "unordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = docFromSpans(spans)
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
          value: { parents: [], type: "unordered-list-item", attrs: {} },
        },
        { type: "text", value: "item 1" },
        {
          type: "block",
          value: { parents: [], type: "ordered-list-item", attrs: {} },
        },
        { type: "text", value: "item 2" },
      ]
      const doc = docFromSpans(spans)

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
        { type: "block", value: { type: "aside", parents: [], attrs: {} } },
      ]
      const doc = docFromSpans(spans)
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
        { type: "block", value: { parents: [], type: "paragraph", attrs: {} } },
        { type: "text", value: "hello world" },
        { type: "block", value: { parents: [], type: "paragraph", attrs: {} } },
        { type: "block", value: { parents: [], type: "aside", attrs: {} } },
        { type: "text", value: "next line" },
      ]

      const doc = docFromSpans(spans)
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
          value: { parents: [], type: "heading", attrs: { level: 1 } },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: { parents: [], type: "heading", attrs: { level: 2 } },
        },
        { type: "text", value: "world" },
      ]

      const doc = docFromSpans(spans)
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
            type: "paragraph",
            parents: [],
            attrs: {},
          },
        },
        {
          type: "block",
          value: {
            type: "image",
            parents: ["paragraph"],
            attrs: {
              alt: "image alt",
              src: "image.png",
              isEmbed: true,
              title: "image title",
            },
          },
        },
      ]
      const doc = docFromSpans(spans)
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
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
          },
        },
        { type: "text", value: "hello" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
          },
        },
        { type: "text", value: "world" },
      ]
      const doc = docFromSpans(spans)
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
            parents: ["blockquote", "unordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "some quote" },
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["blockquote"],
            attrs: {},
          },
        },
        { type: "text", value: "more quote" },
      ]
      const doc = docFromSpans(spans)
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
  })

  describe("the blocksFromNode function", () => {
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
      const blocks = Array.from(blocksFromNode(doc))
      assert.deepStrictEqual(blocks, [
        { type: "paragraph", parents: ["unordered-list-item"], attrs: {} },
        "item 1",
        { type: "unordered-list-item", parents: [], attrs: {} },
      ])
    })
  })

  it("should return an explicit paragraph for the second paragraph in a list item", () => {
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
    const blocks = Array.from(blocksFromNode(doc))
    assert.deepStrictEqual(blocks, [
      { type: "paragraph", parents: ["unordered-list-item"], attrs: {} },
      "item 1",
      { type: "paragraph", parents: ["unordered-list-item"], attrs: {} },
    ])
  })

  describe("the blockDiff function", () => {
    it("nested list items", () => {
      const diff = blockDiff({
        enclosing: null,
        previous: null,
        following: null,
        block: {
          type: "ordered-list-item",
          parents: ["unordered-list-item"],
          attrs: {},
        },
      })
      assert.deepStrictEqual(diff, {
        toOpen: [
          {
            block: "unordered-list-item",
            isParent: true,
            containedBlock: "ordered-list-item",
            openOuter: true,
          },
          {
            block: "ordered-list-item",
            isParent: false,
            containedBlock: null,
            openOuter: true,
          },
        ],
        toClose: [
          { block: "ordered-list-item", isParent: false, closeOuter: true },
          { block: "unordered-list-item", isParent: true, closeOuter: true },
        ],
      })
    })

    it("consecutive list items", () => {
      //{ type: "block", value: { type: "ordered-list-item", parents: [] } },
      //{ type: "block", value: { type: "ordered-list-item", parents: [] } }
      const diff = blockDiff({
        enclosing: null,
        previous: null,
        following: { type: "ordered-list-item", parents: [], attrs: {} },
        block: { type: "ordered-list-item", parents: [], attrs: {} },
      })
      assert.deepStrictEqual(diff, {
        toOpen: [
          {
            block: "ordered-list-item",
            isParent: false,
            containedBlock: null,
            openOuter: true,
          },
        ],
        toClose: [
          { block: "ordered-list-item", isParent: false, closeOuter: false },
        ],
      })
    })
  })
})

function assertTraversalEqual(
  actual: TraversalEvent[],
  expected: TraversalEvent[],
) {
  if (actual.length === expected.length) {
    if (
      actual.every(
        (event, i) => JSON.stringify(event) === JSON.stringify(expected[i]),
      )
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
  return printIndexTable(traverseSpans(spans))
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
