import React, { useEffect, useState, useRef } from "react"

import { Command, EditorState, Transaction } from "prosemirror-state"
import { keymap } from "prosemirror-keymap"
import { baseKeymap, toggleMark } from "prosemirror-commands"
import { schema } from "prosemirror-schema-basic"
import { MarkType } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import "prosemirror-view/style/prosemirror.css"
import { next as automerge, Prop } from "@automerge/automerge"
import { plugin as amgPlugin, init as initPm, PatchSemaphore } from "../src"
import { type DocHandle } from "./DocHandle"
import { exampleSetup } from "prosemirror-example-setup"

export type EditorProps = {
  handle: DocHandle
  path: Prop[]
}

const toggleBold = toggleMarkCommand(schema.marks.strong)
const toggleItalic = toggleMarkCommand(schema.marks.em)

function toggleMarkCommand(mark: MarkType): Command {
  return (
    state: EditorState,
    dispatch: ((tr: Transaction) => void) | undefined
  ) => {
    return toggleMark(mark)(state, dispatch)
  }
}

export function Editor({ handle, path }: EditorProps) {
  const editorRoot = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)

  useEffect(() => {
    const editorConfig = {
      schema,
      history,
      plugins: [
        keymap({
          ...baseKeymap,
          "Mod-b": toggleBold,
          "Mod-i": toggleItalic,
          "Mod-l": toggleMark(schema.marks.link, {
            href: "https://example.com",
            title: "example",
          }),
        }),
        amgPlugin(handle.doc, path),
      ],
      doc: initPm(handle.doc, path),
    }

    const semaphore = new PatchSemaphore()
    const state = EditorState.create(editorConfig)
    const view = new EditorView(editorRoot.current, {
      state,
      dispatchTransaction: (tx: Transaction) => {
        console.log("Dispatching transaction", tx)
        const newState = semaphore.intercept(handle.changeAt, tx, view.state)
        view.updateState(newState)
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPatch: any = (
      docAfter: automerge.Doc<unknown>,
      patches: Array<automerge.Patch>
    ) => {
      const newState = semaphore.reconcilePatch(docAfter, patches, view.state)
      view.updateState(newState)
    }
    handle.addListener(onPatch)


    setView(view)

    return () => {
      view.destroy()
    }
  }, [])

  const onBoldClicked = () => {
    if (view) {
      toggleBold(view.state, view.dispatch, view)
    }
  }

  const onItalicClicked = () => {
    if (view) {
      toggleItalic(view.state, view.dispatch, view)
    }
  }

  const toggleLink = () => {
    if (view) {
      toggleMark(schema.marks.link, {
        href: "https://example.com",
        title: "example",
      })(view.state, view.dispatch, view)
    }
  }

  return <div id="prosemirror">
    <MenuBar onBoldClicked={onBoldClicked} onItalicClicked={onItalicClicked} onLinkClicked={toggleLink}/>
    <div id="editor" ref={editorRoot} />
  </div>
}

type MenuBarProps = {
  onBoldClicked: () => void
  onItalicClicked: () => void
  onLinkClicked: () => void
}

function MenuBar({onBoldClicked, onItalicClicked, onLinkClicked}: MenuBarProps) {
  return <div id="menubar">
    <button id="bold" onClick={onBoldClicked}>𝐁</button>
    <button id="italic" onClick={onItalicClicked}>I</button>
    <button id="link" onClick={onLinkClicked}>🔗</button>
  </div>
}
