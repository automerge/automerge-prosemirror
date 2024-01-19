import React from "react"
import { Editor } from "./Editor"
import { next as automerge } from "@automerge/automerge"
import { DocHandle } from "./DocHandle"
import { mount } from "cypress/react18"

describe("<Editor />", () => {
  it("renders", () => {
    const doc = automerge.from({ text: "Hello World" })
    const handle = new DocHandle(doc)
    mount(<Editor handle={handle} path={["text"]} />)
    editorContents()
      .should("have.html", expectedHtml(["Hello World"]))
  })

  describe("making local edits", () => {
    it("handles adding and deleting a line at the end of the text", () => {
      const doc = automerge.from({ text: "Hello World" })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      editorContents()
        .should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("{enter}")
      editorContents()
        .should("have.html", expectedHtml(["Hello World", null]))
      editorContents().type("{backspace}")
      editorContents()
        .should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("!")
      editorContents()
        .should("have.html", expectedHtml(["Hello World!"]))
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => handle.doc.text)
        .should("equal", "Hello World!")
    })

    it("handles inserting two newlines", () => {
      const doc = automerge.from({ text: "Hello World" })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      editorContents()
        .should("have.html", expectedHtml(["Hello World"]))
      editorContents().type("{moveToEnd}{enter}{enter}{enter}")
      editorContents()
        .should("have.html", expectedHtml(["Hello World", null, null, null]))
      editorContents().type(
        "{moveToStart}{downArrow}{downArrow}{downArrow}{backspace}line two"
      )
      editorContents()
        .should("have.html", expectedHtml(["Hello World", null, "line two"]))
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => handle.doc.text)
        .should("equal", "Hello World\n\nline two")
    })

    it("handles bold marks", () => {
      const doc = automerge.from({ text: "Hello Happy World" })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      editorContents()
        .should("have.html", expectedHtml(["Hello Happy World"]))

      withSelection("Happy", () => boldButton().click())

      editorContents()
        .should(
          "have.html",
          expectedHtml(["Hello <strong>Happy</strong> World"])
        )
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => handle.doc.text)
        .should("equal", "Hello Happy World")
      cy.wait(100)
        .then(() => automerge.marks(handle.doc, ["text"]))
        .should("deep.equal", [
          { name: "strong", value: true, start: 6, end: 11 },
        ])
    })

    it("handles links", () => {
      const doc = automerge.from({ text: "My homepage is here" })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      
      withSelection("homepage", () => linkButton().click())

      editorContents()
        .should(
          "have.html",
          expectedHtml([
            'My <a href="https://example.com" title="example">homepage</a> is here',
          ])
        )
      // Wait for a bit so automerge-repo gets a chance to run
      cy.wait(100)
        .then(() => automerge.marks(handle.doc, ["text"]))
        .should("deep.equal", [
          {
            name: "link",
            value: JSON.stringify({
              href: "https://example.com",
              title: "example",
            }),
            start: 3,
            end: 11,
          },
        ])
    })
  })

  describe("receiving remote changes", () => {
    it("handles inserted text", () => {
      const doc = automerge.from({ text: "Hello World" })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      handle.change(d => automerge.splice(d, ["text"], 5, 0, " Happy"))
      editorContents()
        .should("have.html", expectedHtml(["Hello Happy World"]))
    })

    it("handles text inserted inside a mark", () => {
      let doc = automerge.from({ text: "Hello World" })
      doc = automerge.change(doc, d => {
        automerge.mark(
          d,
          ["text"],
          { start: 6, end: 11, expand: "before" },
          "strong",
          true
        )
      })
      const handle = new DocHandle(doc)
      mount(<Editor handle={handle} path={["text"]} />)
      handle.change(d => automerge.splice(d, ["text"], 6, 0, "Strong"))
      editorContents()
        .should(
          "have.html",
          expectedHtml(["Hello <strong>StrongWorld</strong>"])
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

function italicButton(): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return cy.get("div#prosemirror button#italic")
}

function linkButton(): Cypress.Chainable<JQuery<HTMLButtonElement>> {
  return cy.get("div#prosemirror button#link")
}

function withSelection(selection: string, action: () => void) {
    editorContents().setSelection(selection)
    editorContents().focus()
    action()
}
