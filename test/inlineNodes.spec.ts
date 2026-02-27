import { assert } from "chai"
import { pmDocFromSpans, pmNodeToSpans } from "../src/traversal.js"
import { SchemaAdapter } from "../src/schema.js"
import * as am from "@automerge/automerge"
import { assertPmDocsEqual } from "./utils.js"

describe("when handling inline nodes", () => {
  const adapter = new SchemaAdapter({
    nodes: {
      doc: {
        content: "block+",
      },
      paragraph: {
        automerge: {
          block: "paragraph",
        },
        content: "inline*",
        group: "block",
        parseDOM: [{ tag: "p" }],
        toDOM() {
          return ["p", 0]
        },
      },
      text: {
        group: "inline",
      },
      math_inline: {
        automerge: {
          block: "math-inline",
        },
        content: "text*",
        group: "inline",
        inline: true,
        atom: true,
        parseDOM: [
          {
            tag: "math-inline",
          },
        ],
        toDOM() {
          return ["math-inline", 0]
        },
      },
      math_inline_embed: {
        automerge: {
          block: "math-inline-embed",
          isEmbed: true,
        },
        content: "text*",
        group: "inline",
        inline: true,
      },
      unknownBlock: {
        automerge: {
          unknownBlock: true,
        },
        group: "block",
        content: "block+",
        parseDOM: [{ tag: "div", attrs: { "data-unknown-block": "true" } }],
        toDOM() {
          return ["div", { "data-unknown-block": "true" }, 0]
        },
      },
    },
  })
  const schema = adapter.schema

  describe("when generating a document from spans", () => {
    it("should generate an inline node for the mapped block", () => {
      let amDoc = am.from({ text: "" })
      amDoc = am.change(amDoc, d => {
        am.updateSpans(
          d,
          ["text"],
          [
            { type: "text", value: "hello " },
            {
              type: "block",
              value: {
                type: new am.ImmutableString("math-inline"),
                attrs: {},
                parents: [new am.ImmutableString("paragraph")],
              },
            },
            { type: "text", value: "x = y" },
            {
              type: "block",
              value: {
                type: new am.ImmutableString("paragraph"),
                attrs: {},
                parents: [],
              },
            },
            { type: "text", value: "maths" },
          ],
        )
      })
      const pmDoc = pmDocFromSpans(adapter, am.spans(amDoc, ["text"]))
      assertPmDocsEqual({
        expected: schema.node("doc", null, [
          schema.node("paragraph", { isAmgBlock: false }, [
            schema.text("hello "),
            schema.node("math_inline", { isAmgBlock: true }, [
              schema.text("x = y"),
            ]),
          ]),
          schema.node("paragraph", { isAmgBlock: true }, [
            schema.text("maths"),
          ]),
        ]),
        actual: pmDoc,
      })
    })

    it("should place text inside inline embed nodes when isEmbed is true", () => {
      const original = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: false }, [
          schema.node("math_inline_embed", { isAmgBlock: true }, [
            schema.text("x = y"),
          ]),
        ]),
      ])
      const spans = pmNodeToSpans(adapter, original)
      const roundTripped = pmDocFromSpans(adapter, spans)
      assertPmDocsEqual({ expected: original, actual: roundTripped })
    })
  })

  describe("when generating spans from a document", () => {
    it("should map existing inline nodes to blocks", () => {
      const pmDoc = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: false }, [
          schema.text("hello "),
          schema.node("math_inline", { isAmgBlock: true }, [
            schema.text("x = y"),
          ]),
        ]),
        schema.node("paragraph", { isAmgBlock: true }, [schema.text("maths")]),
      ])
      const spans = pmNodeToSpans(adapter, pmDoc)
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            attrs: {},
            parents: [],
            isEmbed: false,
          },
        },
        { type: "text", value: "hello ", marks: {} },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("math-inline"),
            attrs: {},
            parents: [new am.ImmutableString("paragraph")],
            isEmbed: false,
          },
        },
        { type: "text", value: "x = y", marks: {} },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            attrs: {},
            parents: [],
            isEmbed: false,
          },
        },
        { type: "text", value: "maths", marks: {} },
      ])
    })

    it("should map newly inserted inline nodes to blocks", () => {
      const pmDoc = schema.node("doc", null, [
        schema.node("paragraph", { isAmgBlock: false }, [
          schema.text("hello "),
          schema.node("math_inline", { isAmgBlock: false }, [
            schema.text("x = y"),
          ]),
        ]),
        schema.node("paragraph", { isAmgBlock: true }, [schema.text("maths")]),
      ])
      const spans = pmNodeToSpans(adapter, pmDoc)
      assert.deepStrictEqual(spans, [
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            attrs: {},
            parents: [],
            isEmbed: false,
          },
        },
        { type: "text", value: "hello ", marks: {} },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("math-inline"),
            attrs: {},
            parents: [new am.ImmutableString("paragraph")],
            isEmbed: false,
          },
        },
        { type: "text", value: "x = y", marks: {} },
        {
          type: "block",
          value: {
            type: new am.ImmutableString("paragraph"),
            attrs: {},
            parents: [],
            isEmbed: false,
          },
        },
        { type: "text", value: "maths", marks: {} },
      ])
    })
  })
})
