import React, {useEffect, useRef } from "react"

import {Command, EditorState, Transaction} from "prosemirror-state"
import {keymap} from "prosemirror-keymap"
import {baseKeymap, toggleMark} from "prosemirror-commands"
import {schema} from "prosemirror-schema-basic"
import {MarkType} from "prosemirror-model"
import {EditorView} from "prosemirror-view"
import "prosemirror-view/style/prosemirror.css"
import {unstable as automerge, Prop} from "@automerge/automerge"
import { plugin as amgPlugin, init as initPm, PatchSemaphore } from "../src"
import { type DocHandle } from "./DocHandle"

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

export function Editor({handle, path}: EditorProps) {
  const editorRoot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const editorConfig = {
      schema,
      history,
      plugins: [
        keymap({
          ...baseKeymap,
          "Mod-b": toggleBold,
          "Mod-i": toggleItalic,
          "Mod-l": toggleMark(schema.marks.link, {href: "https://example.com", title: "example"}),
        }),
        amgPlugin(handle.doc, path),
      ],
      doc: initPm(handle.doc, path)
    }

    const semaphore = new PatchSemaphore()
    const state = EditorState.create(editorConfig)
    const view = new EditorView(editorRoot.current, {
      state,
      dispatchTransaction: (tx: Transaction) => {
        const newState = semaphore.intercept(handle.changeAt, tx, view.state)
        view.updateState(newState)
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPatch: any = (docAfter: automerge.Doc<any>, patches: Array<automerge.Patch>) => {
      const newState = semaphore.reconcilePatch(docAfter, patches, view.state)
      view.updateState(newState)
    }
    handle.addListener(onPatch)
    return () => {
      view.destroy()
    }
  }, [])

  return <div id="prosemirror" ref={editorRoot}></div>

}
