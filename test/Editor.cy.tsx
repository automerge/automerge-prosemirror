import { Editor } from "../playground/src/Editor"
import { next as am } from "@automerge/automerge"
import { mount } from "cypress/react18"
import "../playground/src/playground.css"
import { Repo, DocHandle } from "@automerge/automerge-repo"
import { basicSchemaAdapter } from "../src/basicSchema"

const repo = new Repo({ network: [] })

function makeHandle(contents: { text: string }): DocHandle<{ text: string }> {
  const handle = repo.create<{ text: string }>()
  handle.change((d: { text: string }) => {
    d.text = contents.text
  })
  return handle
}

describe("<Editor />", () => {
  it("renders", () => {
    const handle = makeHandle({ text: "Hello World" })
    mount(
      <Editor
        handle={handle}
        path={["text"]}
        schemaAdapter={basicSchemaAdapter}
      />,
    )
    editorContents().should("have.html", expectedHtml(["Hello World"]))
  })

  describe("making local edits", () => {
    it("handles adding and deleting a line at the end of the text", () => {
      const handle = makeHandle({ text: "Hello World" })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )
      editorContents().should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("{enter}")
      editorContents().should("have.html", expectedHtml(["Hello World", null]))
      editorContents().type("{backspace}")
      editorContents().should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("!")
      editorContents().should("have.html", expectedHtml(["Hello World!"]))
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => am.spans(handle.docSync(), ["text"]))
        .should("deep.equal", [
          {
            type: "text",
            value: "Hello World!",
          },
        ])
    })

    it("handles inserting two newlines", () => {
      const handle = makeHandle({ text: "Hello World" })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )
      editorContents().should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("{moveToEnd}{enter}{enter}{enter}")
      editorContents().should(
        "have.html",
        expectedHtml(["Hello World", null, null, null]),
      )
      editorContents().type(
        "{moveToStart}{downArrow}{downArrow}{downArrow}{backspace}line two",
      )
      editorContents().should(
        "have.html",
        expectedHtml(["Hello World", null, "line two"]),
      )
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => am.spans(handle.docSync(), ["text"]))
        .should("deep.equal", [
          {
            type: "block",
            value: {
              type: new am.RawString("paragraph"),
              parents: [],
              attrs: {},
              isEmbed: false,
            },
          },
          { type: "text", value: "Hello World" },
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
              type: new am.RawString("paragraph"),
              parents: [],
              attrs: {},
              isEmbed: false,
            },
          },
          { type: "text", value: "line two" },
        ])
    })

    it("handles bold marks", () => {
      const handle = makeHandle({ text: "Hello Happy World" })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )
      editorContents().should("have.html", expectedHtml(["Hello Happy World"]))

      withSelection("Happy", () => boldButton().click())

      editorContents().should(
        "have.html",
        expectedHtml(["Hello <strong>Happy</strong> World"]),
      )
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => am.spans(handle.docSync(), ["text"]))
        .should("deep.equal", [
          {
            type: "text",
            value: "Hello ",
          },
          {
            type: "text",
            value: "Happy",
            marks: {
              strong: true,
            },
          },
          {
            type: "text",
            value: " World",
          },
        ])

      cy.wait(100)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then(() => am.marks(handle.docSync()!, ["text"]))
        .should("deep.equal", [
          { name: "strong", value: true, start: 6, end: 11 },
        ])
    })

    it("handles links", () => {
      const handle = makeHandle({ text: "My homepage is here" })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )

      withSelection("homepage", () => linkButton().click())

      // now insert the link text into the dialog and click OK
      dialogInput().type("https://example.com")
      dialogButton().click()

      editorContents().should(
        "have.html",
        expectedHtml([
          'My <a href="https://example.com" title="">homepage</a> is here',
        ]),
      )
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .then(() => am.marks(handle.docSync()!, ["text"]))
        .should("deep.equal", [
          {
            name: "link",
            value: JSON.stringify({
              href: "https://example.com",
              title: "",
            }),
            start: 3,
            end: 11,
          },
        ])
    })
  })

  describe("receiving remote changes", () => {
    it("handles inserted text", () => {
      const handle = makeHandle({ text: "Hello World" })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )
      handle.change((d: { text: string }) =>
        am.splice(d, ["text"], 5, 0, " Happy"),
      )
      editorContents().should("have.html", expectedHtml(["Hello Happy World"]))
    })

    it("handles text inserted inside a mark", () => {
      const handle = makeHandle({ text: "Hello World" })
      handle.change((d: { text: string }) => {
        am.mark(
          d,
          ["text"],
          { start: 6, end: 11, expand: "before" },
          "strong",
          true,
        )
      })
      mount(
        <Editor
          handle={handle}
          path={["text"]}
          schemaAdapter={basicSchemaAdapter}
        />,
      )
      handle.change((d: { text: string }) =>
        am.splice(d, ["text"], 6, 0, "Strong"),
      )
      editorContents().should(
        "have.html",
        expectedHtml(["Hello <strong>StrongWorld</strong>"]),
      )
    })
  })
})

type TextLine = string
type EmptyLine = null
type Expected = EmptyLine | TextLine

function expectedHtml(expected: Expected[]): string {
  return expected
    .map(line => {
      if (line === null) {
        return '<p><br class="ProseMirror-trailingBreak"></p>'
      } else {
        return `<p>${line}</p>`
      }
    })
    .join("")
}

function editorContents(): Cypress.Chainable<JQuery<HTMLDivElement>> {
  return cy.get("div#editor div[contenteditable=true]")
}

function boldButton(): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return cy.get("div#prosemirror button#bold")
}

function linkButton(): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return cy.get("div#prosemirror button#link")
}

function activeDialog(): Cypress.Chainable<JQuery<HTMLDialogElement>> {
  return cy.get("dialog[open]")
}

function dialogInput(): Cypress.Chainable<JQuery<HTMLInputElement>> {
  return activeDialog().find("input")
}

function dialogButton(): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return activeDialog().find("button")
}

function withSelection(selection: string, action: () => void) {
  editorContents().setSelection(selection)
  editorContents().focus()
  action()
}
