import React, { useEffect, useRef, useState } from "react"

import { Command, EditorState, Transaction } from "prosemirror-state"
import { keymap } from "prosemirror-keymap"
import { baseKeymap, toggleMark } from "prosemirror-commands"
import { history, redo, undo } from "prosemirror-history"
import { schema } from "prosemirror-schema-basic"
import { MarkType } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import { DocHandle, DocHandleChangePayload, DocHandlePatchPayload } from "automerge-repo"
import "prosemirror-view/style/prosemirror.css"
import { default as automergePlugin } from "./plugin"

import { default as pmToAm } from "./pmToAm"
import { default as amToPm } from "./amToPm"


import { Text } from "@automerge/automerge"

export type EditorProps<T> = {
  handle: DocHandle<T>
  attribute: keyof T
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

export function Editor<T>({ handle, attribute }: EditorProps<T>) {
  const editorRoot = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    let editorConfig = {
      schema,
      history,
      plugins: [
        keymap({
          ...baseKeymap,
          "Mod-b": toggleBold,
          "Mod-i": toggleItalic,
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        automergePlugin({
          doChange: change => handle.change(d => change(d, "text")),
          patches: handle
        })
      ],
      // @ts-ignore
      doc: schema.node("doc", null, [
        // @ts-ignore
        schema.node("paragraph", null, schema.text(handle.doc.text.toString()))
      ])
    }      

    let state = EditorState.create(editorConfig)
    const view = new EditorView(editorRoot.current, { 
      state,
    })
    return () => {
      view.destroy()
    }
  }, [attribute])
  
  return <div ref={editorRoot}></div>

}
