import { assert } from "chai"
import { next as am } from "@automerge/automerge"
import { patchSpans } from "../src/maintainSpans.js"
import { splitBlock } from "./utils.js"
import * as fc from "fast-check"

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
            type: new am.ImmutableString("paragraph"),
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
            type: new am.ImmutableString("paragraph"),
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
            type: new am.ImmutableString("paragraph"),
            parents: [],
            attrs: {},
          },
        },
        { type: "text", value: "ite" },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
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
        attrs: { type: new am.ImmutableString("todo") },
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        { type: "text", value: "hello " },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            parents: [],
            attrs: { type: new am.ImmutableString("todo") },
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
        attrs: { type: new am.ImmutableString("todo") },
      })(["text"])) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            parents: [],
            attrs: { type: new am.ImmutableString("todo") },
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

  describe("when handling splice patches", () => {
    it("should not remove text blocks", () => {
      const spans: am.Span[] = [
        {
          type: "block",
          value: {
            attrs: {
              level: 1,
            },
            parents: [],
            type: "heading",
          },
        },
        {
          type: "text",
          value: "Heading",
        },
        {
          type: "block",
          value: {
            type: "paragraph",
            attrs: {},
            parents: [],
          },
        },
        {
          type: "text",
          value: "some text",
        },
        {
          type: "block",
          value: {
            attrs: {},
            type: "paragraph",
            parents: [],
          },
        },
        {
          type: "text",
          value: "b",
        },
        {
          type: "block",
          value: {},
        },
      ]
      const patches: am.Patch[] = [
        { action: "splice", path: ["text", 21], value: "a" },
      ]
      for (const patch of patches) {
        patchSpans(["text"], spans, patch)
      }
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            attrs: {
              level: 1,
            },
            parents: [],
            type: "heading",
          },
        },
        {
          type: "text",
          value: "Heading",
        },
        {
          type: "block",
          value: {
            type: "paragraph",
            attrs: {},
            parents: [],
          },
        },
        {
          type: "text",
          value: "some text",
        },
        {
          type: "block",
          value: {
            attrs: {},
            type: "paragraph",
            parents: [],
          },
        },
        {
          type: "text",
          value: "b",
        },
        {
          type: "block",
          value: {},
        },
        {
          type: "text",
          value: "a",
        },
      ])
    })
  })

  it("should delete a block after splicing before the block", () => {
    const spansBefore: am.Span[] = [
      { type: "block", value: { type: "0", parents: [], attrs: {} } },
      { type: "text", value: " 0" },
    ]
    const spansAfter: am.Span[] = [{ type: "text", value: "  0" }]
    const patches: am.Patch[] = [
      { action: "splice", path: ["text", 0], value: " " },
      { action: "del", path: ["text", 1] },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle deletions which cross block boundaries", () => {
    const spansBefore: am.Span[] = [
      { type: "text", value: "0Y d1" },
      { type: "block", value: { type: "ef", parents: [], attrs: {} } },
      { type: "text", value: "Y d1" },
      { type: "block", value: { type: "BtCbs", parents: [], attrs: {} } },
      { type: "block", value: { type: "ref", parents: [], attrs: {} } },
      { type: "block", value: { type: "n", parents: [], attrs: {} } },
      { type: "block", value: { type: "y", parents: [], attrs: {} } },
    ]
    const spansAfter: am.Span[] = [
      { type: "text", value: "  Rd1" },
      { type: "block", value: { parents: [], attrs: {}, type: "BtCbs" } },
      { type: "block", value: { type: "ref", attrs: {}, parents: [] } },
      { type: "block", value: { type: "n", parents: [], attrs: {} } },
      { type: "block", value: { type: "y", parents: [], attrs: {} } },
    ]

    const patches: am.Patch[] = [
      { action: "del", path: ["text", 0], length: 7 },
      { action: "splice", path: ["text", 1], value: " R" },
    ]

    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle more deletions which cross block boundaries", () => {
    const spansBefore: am.Span[] = [
      { type: "block", value: { type: "0", parents: [], attrs: {} } },
      { type: "text", value: "0A" },
    ]

    const spansAfter: am.Span[] = [{ type: "text", value: " XA" }]

    const patches: am.Patch[] = [
      { action: "splice", path: ["text", 0], value: " X" },
      { action: "del", path: ["text", 2], length: 2 },
    ]

    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle simple mark splices", () => {
    const spansBefore: am.Span[] = []
    const spansAfter: am.Span[] = [
      { type: "text", value: "a", marks: { a: " " } },
    ]
    const patches: am.Patch[] = [
      { action: "splice", path: ["text", 0], value: "a", marks: { a: " " } },
    ]

    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle splices with different marks", () => {
    const spansBefore: am.Span[] = []
    const spansAfter: am.Span[] = [
      { type: "text", value: "a", marks: { " ": " " } },
      { type: "text", value: "aaaaaacalwIyler" },
    ]
    const patches: am.Patch[] = [
      { action: "splice", path: ["text", 0], value: "a", marks: { " ": " " } },
      { action: "splice", path: ["text", 1], value: "aaaaaacalwIyler" },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle splice patches which add a mark in an unmarked span", () => {
    const spansBefore: am.Span[] = [{ type: "text", value: " " }]
    const spansAfter: am.Span[] = [
      { type: "text", value: "0" },
      { type: "text", value: "0", marks: { " ": "A" } },
      { type: "text", value: "K1 To 8000000 " },
    ]
    const patches: am.Patch[] = [
      { action: "splice", path: ["text", 0], value: "0" },
      { action: "splice", path: ["text", 1], value: "0", marks: { " ": "A" } },
      { action: "splice", path: ["text", 2], value: "K1 To 8000000" },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle mark patches", () => {
    const spansBefore: am.Span[] = [{ type: "text", value: " " }]
    const spansAfter: am.Span[] = [
      { type: "text", value: " ", marks: { "0": "a" } },
    ]
    const patches: am.Patch[] = [
      {
        action: "mark",
        path: ["text"],
        marks: [{ name: "0", value: "a", start: 0, end: 1 }],
      },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should consolidate spans when marking", () => {
    const spansBefore: am.Span[] = [{ type: "text", value: "0" }]
    const spansAfter: am.Span[] = [
      {
        type: "text",
        value: "aaaconstructoraaa",
        marks: { "17 ": "prototype" },
      },
      { type: "text", value: "aaaaaaaaaaa0", marks: { a: " " } },
    ]
    const patches: am.Patch[] = [
      {
        action: "splice",
        path: ["text", 0],
        value: "aaaconstructoraaa",
        marks: { "17 ": "prototype" },
      },
      {
        action: "splice",
        path: ["text", 17],
        value: "aaaaaaaaaaa",
        marks: { a: " " },
      },
      {
        action: "mark",
        path: ["text"],
        marks: [{ name: "a", value: " ", start: 28, end: 29 }],
      },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle delete after a mark", () => {
    const spansBefore: am.Span[] = [{ type: "text", value: "aa" }]
    const spansAfter: am.Span[] = [
      { type: "text", value: "a", marks: { " ": "A" } },
    ]
    const patches: am.Patch[] = [
      {
        action: "mark",
        path: ["text"],
        marks: [{ name: " ", value: "A", start: 0, end: 1 }],
      },
      { action: "del", path: ["text", 1] },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should merge when a splice extends a marked range at the end", () => {
    const spansBefore: am.Span[] = [{ type: "text", value: "o world" }]
    const spansAfter: am.Span[] = [
      { type: "text", value: "hello top", marks: { bold: true } },
      { type: "text", value: " world" },
    ]
    const patches: am.Patch[] = [
      {
        action: "splice",
        path: ["text", 0],
        value: "hello t",
        marks: { bold: true },
      },
      {
        action: "mark",
        path: ["text"],
        marks: [{ name: "bold", value: true, start: 7, end: 8 }],
      },
      {
        action: "splice",
        path: ["text", 8],
        value: "p",
        marks: { bold: true },
      },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should do nothing when a mark is added to a block", () => {
    const spansBefore: am.Span[] = [
      { type: "block", value: { type: "0", parents: [], attrs: {} } },
      { type: "text", value: "hello" },
    ]
    const patches: am.Patch[] = [
      {
        action: "mark",
        path: ["text"],
        marks: [{ name: "bold", value: true, start: 0, end: 1 }],
      },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansBefore)
  })

  it("should delete a block when the delete span ends in a block boundary", () => {
    const spansBefore: am.Span[] = [
      {
        type: "text",
        value: "hello",
      },
      { type: "block", value: { type: "0", parents: [], attrs: {} } },
      { type: "text", value: "A" },
    ]
    const spansAfter: am.Span[] = [{ type: "text", value: "hA" }]
    const patches: am.Patch[] = [
      { action: "del", path: ["text", 1], length: 5 },
    ]
    const patched = deepCopy(spansBefore)
    for (const patch of patches) {
      patchSpans(["text"], patched, patch)
    }
    assert.deepStrictEqual(patched, spansAfter)
  })

  it("should handle any kind of patch", function () {
    this.timeout(0)
    fc.assert(
      fc.property(scenario(), ({ spansBefore, spansAfter, patches }) => {
        const updatedSpans = deepCopy(spansBefore)
        for (const patch of patches) {
          patchSpans(["text"], updatedSpans, patch)
        }
        try {
          assert.deepEqual(updatedSpans, spansAfter)
        } catch (e) {
          console.log("expected: ", JSON.stringify(spansAfter))
          console.log("actual: ", JSON.stringify(updatedSpans))
          console.log(e)
          throw e
        }
      }),
      {
        numRuns: process.env.CI ? 10 : 100,
        reporter: out => {
          if (out.failed) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            console.log(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              `actions: ${JSON.stringify(out.counterexample![0].actions)}`,
            )
            console.log("reproducing test case: \n")
            console.log("const spansBefore: am.Span[] = [")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const span of out.counterexample![0].spansBefore) {
              console.log("  ", JSON.stringify(span), ",")
            }
            console.log("]")
            console.log("const spansAfter: am.Span[] = [")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const span of out.counterexample![0].spansAfter) {
              console.log("  ", JSON.stringify(span), ",")
            }
            console.log("]")
            console.log("const patches: am.Patch[] = [")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const patch of out.counterexample![0].patches) {
              console.log(JSON.stringify(patch), ",")
            }
            console.log("]")
            throw new Error("failed")
          }
        },
      },
    )
  })
})

type Scenario = {
  spansBefore: am.Span[]
  spansAfter: am.Span[]
  patches: am.Patch[]
  actions: Action[]
  doc: am.Doc<unknown>
  headsBefore: am.Heads
  headsAfter: am.Heads
}

function arbAttrName(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant("bold"),
    fc.constant("italic"),
    fc.constant("anchor"),
  )
}

function arbAttrValue(): fc.Arbitrary<am.MarkValue> {
  return fc.oneof(
    fc.constant("left"),
    fc.constant("right"),
    fc.constant(true),
    fc.constant(false),
    // fc.date(),
    fc.integer(),
    // fc.float(),
  )
}

function arbBlockname(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant("p"),
    fc.constant("unordered-list"),
    fc.constant("ordered-list"),
  )
}

function arbSpans(): fc.Arbitrary<am.Span[]> {
  return fc
    .array(
      fc.oneof(
        fc.record<am.Span>(
          {
            type: fc.constant("block"),
            value: fc.record(
              {
                type: arbBlockname(),
                parents: fc
                  .array(arbBlockname(), { maxLength: 5 })
                  .map(s => s.map(s => new am.ImmutableString(s))),
                attrs: fc.object({
                  maxDepth: 0,
                  key: arbAttrName(),
                  values: [arbAttrValue()],
                }),
              },
              { noNullPrototype: true },
            ),
          },
          { noNullPrototype: true },
        ),
        fc.record<am.Span>(
          {
            type: fc.constant("text"),
            value: fc.string({ maxLength: 100 }),
            // value: sensibleString({ size: "small" }),
          },
          { noNullPrototype: true },
        ),
      ),
    )
    .map(spans => {
      //consolidate consecutive text spans
      let result: am.Span[] = []
      let lastSpan: am.Span | null = null
      for (const span of spans) {
        if (
          lastSpan !== null &&
          lastSpan.type === "text" &&
          span.type === "text"
        ) {
          lastSpan.value += span.value
        } else {
          result.push(span)
          lastSpan = span
        }
      }
      // truncate spans longer than 100 characters
      result = result.map(span => {
        if (span.type === "text" && span.value.length > 100) {
          return { ...span, value: span.value.slice(0, 100) }
        }
        return span
      })
      // remove spans with empty values
      result = result.filter(
        span =>
          span.type === "block" || (span.type === "text" && span.value !== ""),
      )
      return deepFreeze(result)
    })
}

function symbolString(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 0, maxLength: 20 })
    .filter(s => /^[a-zA-Z0-9_]+$/.test(s) && s !== "__proto__")
}

function scenario(): fc.Arbitrary<Scenario> {
  return arbSpans().chain(spansBefore => {
    let initDoc = am.from({ text: "" })
    initDoc = am.change(initDoc, d => am.updateSpans(d, ["text"], spansBefore))
    const headsBefore = am.getHeads(initDoc)
    return fc.integer({ min: 0, max: 5 }).chain(numActions => {
      const doMoreModifications = (
        spansBefore: am.Span[],
        startHeads: am.Heads,
        doc: am.Doc<{ text: string }>,
        changesSoFar: number,
        actionsSoFar: Action[],
      ): fc.Arbitrary<{
        spansBefore: am.Span[]
        startHeads: am.Heads
        doc: am.Doc<{ text: string }>
        actions: Action[]
      }> => {
        if (changesSoFar >= numActions) {
          return fc.constant({
            startHeads,
            doc,
            spansBefore,
            actions: actionsSoFar,
          })
        }
        return fc.tuple(arbAction(doc), fc.context()).chain(([action, ctx]) => {
          ctx.log(`action: ${JSON.stringify(action)}`)
          const updated = applyAction(am.clone(doc), action)
          const newActions = actionsSoFar.slice()
          newActions.push(action)
          return doMoreModifications(
            spansBefore,
            startHeads,
            updated,
            changesSoFar + 1,
            newActions,
          )
        })
      }
      return doMoreModifications(spansBefore, headsBefore, initDoc, 0, []).map(
        ({ spansBefore, startHeads, doc, actions }) => {
          const patches = am.diff(doc, startHeads, am.getHeads(doc))
          const spansAfter = am.spans(doc, ["text"])
          return deepFreeze({
            spansBefore,
            spansAfter,
            patches,
            actions,
            doc,
            headsBefore,
            headsAfter: am.getHeads(doc),
          })
        },
      )
    })
  })
}

type Action =
  | { type: "insert"; index: number; chars: string }
  | { type: "delete"; index: number; length: number }
  | {
      type: "addMark"
      range: am.MarkRange
      name: string
      value: am.MarkValue
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "splitBlock"; index: number; value: { [key: string]: any } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "updateBlock"; index: number; value: { [key: string]: any } }

function arbAction(doc: am.Doc<{ text: string }>): fc.Arbitrary<Action> {
  if (doc.text.length === 0) {
    return fc.record(
      {
        type: fc.constant("insert" as const),
        index: fc.constant(0),
        chars: sensibleString({ size: "small" }),
      },
      { noNullPrototype: true },
    )
  }
  const actions = [insert(doc), del(doc), addMark(doc), arbSplitBlock(doc)]
  const spans = am.spans(doc, ["text"])
  const blockCount = spans.reduce((acc, span) => {
    if (span.type === "block") {
      acc++
    }
    return acc
  }, 0)
  if (blockCount > 0) {
    actions.push(arbUpdateBlock(spans))
  }
  return fc.oneof(...actions)
}

function insert(doc: am.Doc<{ text: string }>): fc.Arbitrary<Action> {
  return fc.record(
    {
      type: fc.constant("insert" as const),
      index: fc.integer({ min: 0, max: doc.text.length }),
      chars: sensibleString({ size: "small" }),
    },
    { noNullPrototype: true },
  )
}

function del(doc: am.Doc<{ text: string }>): fc.Arbitrary<Action> {
  return fc
    .integer({ min: 0, max: doc.text.length })
    .chain(index => {
      return fc.tuple(
        fc.constant(index),
        fc.integer({ min: 0, max: doc.text.length - index }),
      )
    })
    .map(([index, length]) => {
      return { type: "delete", index, length }
    })
}

function addMark(doc: am.Doc<{ text: string }>): fc.Arbitrary<Action> {
  type MarkExpand = "before" | "after" | "both" | "none"
  function arbExpand(): fc.Arbitrary<MarkExpand> {
    return fc.oneof(
      fc.constant<MarkExpand>("before"),
      fc.constant<MarkExpand>("after"),
      fc.constant<MarkExpand>("both"),
      fc.constant<MarkExpand>("none"),
    )
  }
  return fc.integer({ min: 0, max: doc.text.length - 1 }).chain(start => {
    const end = fc.integer({ min: start + 1, max: doc.text.length })
    return fc.tuple(end, arbExpand()).chain(([end, expand]) => {
      return fc.record(
        {
          type: fc.constant("addMark" as const),
          range: fc.constant({ start, end, expand }),
          name: arbAttrName(),
          value: arbAttrValue(),
        },
        { noNullPrototype: true },
      )
    })
  })
}

function arbSplitBlock(doc: am.Doc<{ text: string }>): fc.Arbitrary<Action> {
  return fc.record(
    {
      type: fc.constant("splitBlock" as const),
      index: fc.integer({ min: 0, max: doc.text.length - 1 }),
      value: arbBlock(),
    },
    { noNullPrototype: true },
  )
}

function arbUpdateBlock(spans: am.Span[]): fc.Arbitrary<Action> {
  const blockIndices: number[] = spans.reduce((acc, span, index) => {
    if (span.type === "block") {
      acc.push(index)
    }
    return acc
  }, [] as number[])
  return fc
    .tuple(fc.constantFrom(...blockIndices), arbBlock())
    .map(([index, block]) => {
      return { type: "updateBlock", index, value: block }
    })
}

function arbBlock() {
  return fc.record(
    {
      type: symbolString().map(s => new am.ImmutableString(s)),
      parents: fc
        .array(symbolString(), { maxLength: 5 })
        .map(s => s.map(s => new am.ImmutableString(s))),
      attrs: fc.object({
        maxDepth: 1, // TODO: increase maxDepth
        key: symbolString(),
        values: [sensibleString().map(s => new am.ImmutableString(s))],
      }),
    },
    { noNullPrototype: true },
  )
}

function applyAction(
  doc: am.Doc<{ text: string }>,
  action: Action,
): am.Doc<{ text: string }> {
  return am.change(doc, d => {
    if (action.type === "insert") {
      am.splice(d, ["text"], action.index, 0, action.chars)
    } else if (action.type === "delete") {
      am.splice(d, ["text"], action.index, action.length, "")
    } else if (action.type === "splitBlock") {
      am.splitBlock(d, ["text"], action.index, action.value)
    } else if (action.type === "updateBlock") {
      am.updateBlock(d, ["text"], action.index, action.value)
    } else {
      am.mark(d, ["text"], action.range, action.name, action.value)
    }
  })
}

function sensibleString(
  constraints?: fc.StringMatchingConstraints,
): fc.Arbitrary<string> {
  if (constraints === undefined) {
    constraints = { size: "small" }
  }
  return fc.stringMatching(/^[a-zA-Z0-9 ]+$/, constraints)
}

function deepCopy<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map(deepCopy) as T
  } else if (am.isImmutableString(val)) {
    return val as T
  } else if (val instanceof Date) {
    return new Date(val.getTime()) as T
  } else if (typeof val === "object" && val !== null) {
    const copy: { [key: string]: any } = {}
    // Use Object.keys() to preserve property order
    for (const key of Object.keys(val)) {
      copy[key] = deepCopy((val as any)[key])
    }
    return copy as T
  } else {
    return val
  }
}

function deepFreeze<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map(deepFreeze) as T
  } else if (am.isImmutableString(val)) {
    return val as T
  } else if (val instanceof Date) {
    return new Date(val.getTime()) as T
  } else if (typeof val === "object" && val !== null) {
    const copy: { [key: string]: any } = {}
    // Use Object.keys() to preserve property order
    for (const key of Object.keys(val)) {
      copy[key] = deepFreeze((val as any)[key])
    }
    return Object.freeze(copy) as T
  } else {
    return val
  }
}
