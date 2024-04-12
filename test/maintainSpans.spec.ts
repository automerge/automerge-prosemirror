import { assert } from "chai"
import { next as am } from "@automerge/automerge"
import { patchSpans } from "../src/maintainSpans"
import { splitBlock } from "./utils"

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
    patchSpans(["text"], spans, {
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

  describe("when handling a block insertion", () => {
    it("should insert a new block after top level text", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      for (const patch of splitBlock(6, {
        type: "paragraph",
        parents: [],
        attrs: {},
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        { type: "text", value: "hello " },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "world" },
      ])
    })

    it("should break text into two nodes", () => {
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
      ]
      for (const patch of splitBlock(4, {
        type: "paragraph",
        parents: [],
        attrs: {},
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "ite" },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "m 1" },
      ])
    })

    it("should set the attributes from the patch", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      for (const patch of splitBlock(6, {
        type: "paragraph",
        parents: [],
        attrs: { type: new am.RawString("todo") },
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        { type: "text", value: "hello " },
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: { type: new am.RawString("todo") },
          },
        },
        { type: "text", value: "world" },
      ])
    })

    it("should set the attributes from the patch when not splitting text", () => {
      const spans: am.Span[] = [{ type: "text", value: "hello world" }]
      for (const patch of splitBlock(0, {
        type: "paragraph",
        parents: [],
        attrs: { type: new am.RawString("todo") },
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: new am.RawString("paragraph"),
            parents: [],
            attrs: { type: new am.RawString("todo") },
          },
        },
        { type: "text", value: "hello world" },
      ])
    })
  })

  describe("when deleting a block", () => {
    it("should join two sibling blocks", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "hello " },
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "world" },
      ]
      patchSpans(["text"], spans, {
        action: "del",
        path: ["text", 7],
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
      patchSpans(["text"], spans, {
        action: "del",
        path: ["text", 12],
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
      patchSpans(["text"], spans, {
        action: "del",
        path: ["text", 13],
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
      patchSpans(["text"], spans, {
        action: "del",
        path: ["text", 0],
      })
      assert.deepStrictEqual(spans, [{ type: "text", value: "heading one" }])
    })
  })

  describe("when handling updateBlock", () => {
    it("should update block marker attributes", () => {
      const spans: am.Span[] = [
        { type: "block", value: { type: "paragraph", parents: [], attrs: {} } },
        { type: "text", value: "item one" },
      ]
      patchSpans(["text"], spans, {
        action: "insert",
        path: ["text", 0, "parents", 0],
        values: ["ordered-list-item"],
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
      patchSpans(["text"], spans, {
        action: "put",
        path: ["text", 0, "type"],
        value: "ordered-list-item",
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
      patchSpans(["text"], spans, {
        action: "put",
        path: ["text", 0, "attrs", "type"],
        value: "todo",
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
        action: "del",
        path: ["text", 0],
      },
      {
        action: "del",
        path: ["text", 0],
        length: 8,
      },
      {
        action: "del",
        path: ["text", 0],
      },
      {
        action: "del",
        path: ["text", 0],
        length: 8,
      },
    ]
    for (const patch of patches) {
      patchSpans(["text"], spans, patch)
    }
    assert.deepStrictEqual(spans, [])
  })
})
