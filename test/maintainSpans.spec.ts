import { assert } from "chai"
import { next as am } from "@automerge/automerge"
import { patchSpans } from "../src/maintainSpans"

describe("the patchSpans function", () => {
  it("should update the spans after a delete", () => {
    const spans: am.Span[] = [
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line one" },
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line two" },
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line three" },
    ]
    patchSpans(spans, {
      action: "del",
      path: ["text", 5],
      length: 4,
    })
    assert.deepStrictEqual(spans, [
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line" },
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line two" },
      { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      { type: "text", value: "line three" },
    ])
  })

  describe("when handling splitBlock", () => {
    it("should insert a new block after top level text", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      patchSpans(spans, {
        action: "splitBlock",
        path: ["text", 6],
        index: 6,
        type: "paragraph",
        parents: [],
        attrs: {},
      })
      assert.deepStrictEqual(spans, [
        { type: "text", value: "hello " },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "world" },
      ])
    })

    it("should break text into two nodes", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item 1" },
      ]
      patchSpans(spans, {
        action: "splitBlock",
        path: ["block", 4],
        index: 4,
        type: "paragraph",
        parents: [],
        attrs: {},
      })
      assert.deepStrictEqual(spans, [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "ite" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "m 1" },
      ])
    })

    it("should set the attributes from the patch", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      patchSpans(spans, {
        action: "splitBlock",
        path: ["text", 6],
        index: 6,
        type: "paragraph",
        parents: [],
        attrs: { type: "todo" },
      })
      assert.deepStrictEqual(spans, [
        { type: "text", value: "hello " },
        {
          type: "block",
          value: { type: "paragraph", parents: [], attrs: { type: "todo" } },
        },
        { type: "text", value: "world" },
      ])
    })

    it("should set the attributes from the patch when not splitting text", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      patchSpans(spans, {
        action: "splitBlock",
        path: ["text", 0],
        index: 0,
        type: "paragraph",
        parents: [],
        attrs: { type: "todo" },
      })
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: { type: "paragraph", parents: [], attrs: { type: "todo" } },
        },
        { type: "text", value: "hello world" },
      ])
    })
  })

  describe("when handling joinBlock", () => {
    it("should join two sibling blocks", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello " },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "world" },
      ]
      patchSpans(spans, {
        action: "joinBlock",
        path: ["block", 7],
        index: 7,
      })
      assert.deepStrictEqual(spans, [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello world" },
      ])
    })

    it("should remove the last block", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello world" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
      ]
      patchSpans(spans, {
        action: "joinBlock",
        path: ["text", 12],
        index: 12,
      })
      assert.deepStrictEqual(spans, [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello world" },
      ])
    })

    it("should remove an intermediate empty block", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello world" },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "next line" },
      ]
      patchSpans(spans, {
        action: "joinBlock",
        path: ["block", 13],
        index: 13,
      })
      assert.deepStrictEqual(spans, [
        { type: "block", value: { parents: [], type: "paragraph", attrs: {} } },
        { type: "text", value: "hello world" },
        { type: "block", value: { parents: [], type: "paragraph", attrs: {} } },
        { type: "text", value: "next line" },
      ])
    })

    it("should remove the first block in a document", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "heading", parents: [], attrs: {} } },
        { type: "text", value: "heading one" },
      ]
      patchSpans(spans, {
        action: "joinBlock",
        path: ["block", 0],
        index: 0,
      })
      assert.deepStrictEqual(spans, [{ type: "text", value: "heading one" }])
    })
  })

  describe("when handling updateBlock", () => {
    it("should update the parents", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item one" },
      ]
      patchSpans(spans, {
        action: "updateBlock",
        path: ["block", 0],
        new_parents: ["ordered-list-item"],
        index: 0,
        new_type: null,
        new_attrs: null,
      })
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: "paragraph",
            parents: ["ordered-list-item"],
            attrs: {},
          },
        },
        { type: "text", value: "item one" },
      ])
    })

    it("should update the type", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item one" },
      ]
      patchSpans(spans, {
        action: "updateBlock",
        path: ["block", 0],
        new_parents: null,
        index: 0,
        new_type: "ordered-list-item",
        new_attrs: null,
      })
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: { type: "ordered-list-item", parents: [], attrs: {} },
        },
        { type: "text", value: "item one" },
      ])
    })

    it("should update the span attributes", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item one" },
      ]
      patchSpans(spans, {
        action: "updateBlock",
        path: ["block", 0],
        new_parents: null,
        index: 0,
        new_type: null,
        new_attrs: { type: "todo" },
      })
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: { type: "paragraph", parents: [], attrs: { type: "todo" } },
        },
        { type: "text", value: "item one" },
      ])
    })
  })

  it("should handle deleting the whole document", () => {
    const spans: am.Span[] = [
      {
        type: "block",
        value: { type: "ordered-list-item", parents: [], attrs: {} },
      },
      { type: "text", value: "item one" },
      {
        type: "block",
        value: {
          type: "ordered-list-item",
          parents: ["ordered-list-item"],
          attrs: {},
        },
      },
      { type: "text", value: "item two" },
    ]
    const patches: am.Patch[] = [
      {
        action: "joinBlock",
        index: 0,
        path: ["text", 0],
      },
      {
        action: "del",
        path: ["text", 0],
        length: 8,
      },
      {
        action: "joinBlock",
        path: ["text", 0],
        index: 0,
      },
      {
        action: "del",
        path: ["text", 0],
        length: 8,
      },
    ]
    for (const patch of patches) {
      patchSpans(spans, patch)
    }
    assert.deepStrictEqual(spans, [])
  })
})
