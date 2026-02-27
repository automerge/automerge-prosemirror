import { assert } from "chai"
import { basicSchemaAdapter, pmNodeToSpans } from "../src/index.js"
import { defaultMarkdownParser } from "prosemirror-markdown"
import { next as am } from "@automerge/automerge"

describe("Markdown to spans conversion", () => {
  function markdownToSpans(text: string) {
    const node = defaultMarkdownParser.parse(text)
    return pmNodeToSpans(basicSchemaAdapter, node)
  }

  it("should convert simple markdown with heading and paragraphs", () => {
    const markdown = `# Markdown to Automerge example

This example demonstrates how to convert Markdown to Automerge format.

It uses [prosemirror-markdown](https://github.com/ProseMirror/prosemirror-markdown) and [automerge-prosemirror](https://github.com/automerge/automerge-prosemirror/) to achieve this.`

    const spans = markdownToSpans(markdown)

    // Should have block spans for structure and text spans for content
    const expectedSpans: am.Span[] = [
      {
        type: "block",
        value: {
          type: new am.ImmutableString("heading"),
          parents: [],
          attrs: { level: 1 },
          isEmbed: false,
        },
      },
      { type: "text", value: "Markdown to Automerge example", marks: {} },
      {
        type: "block",
        value: {
          type: new am.ImmutableString("paragraph"),
          parents: [],
          attrs: {},
          isEmbed: false,
        },
      },
      {
        type: "text",
        value:
          "This example demonstrates how to convert Markdown to Automerge format.",
        marks: {},
      },
      {
        type: "block",
        value: {
          type: new am.ImmutableString("paragraph"),
          parents: [],
          attrs: {},
          isEmbed: false,
        },
      },
      { type: "text", value: "It uses ", marks: {} },
      {
        type: "text",
        value: "prosemirror-markdown",
        marks: {
          link: '{"href":"https://github.com/ProseMirror/prosemirror-markdown","title":null}',
        },
      },
      { type: "text", value: " and ", marks: {} },
      {
        type: "text",
        value: "automerge-prosemirror",
        marks: {
          link: '{"href":"https://github.com/automerge/automerge-prosemirror/","title":null}',
        },
      },
      { type: "text", value: " to achieve this.", marks: {} },
    ]

    // Assert the exact expected format with proper block structure
    assert.deepEqual(
      spans,
      expectedSpans,
      "Should match expected Automerge rich text span format with blocks and link marks",
    )
  })
})
