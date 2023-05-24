import React, { useEffect, useRef } from "react"

import { Command, EditorState, Transaction } from "prosemirror-state"
import { keymap } from "prosemirror-keymap"
import { baseKeymap, toggleMark } from "prosemirror-commands"
import { history, redo, undo } from "prosemirror-history"
import { schema } from "prosemirror-schema-basic"
import { MarkType } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import { DocHandle, DocHandlePatchPayload } from "automerge-repo"

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

export function Editor<T>({ attribute }: EditorProps<T>) {
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
      ],
      doc: schema.node("doc", null, schema.node("paragraph", null))
    }      

    let state = EditorState.create(editorConfig)
      const view = new EditorView(editorRoot.current, { 
        state,
        dispatchTransaction(transaction) {
          console.log("Document size went from", transaction.before.content.size,
            "to", transaction.doc.content.size)
          let newState = view.state.apply(transaction)
          view.updateState(newState)
        }
      })

  }, [attribute])
  

  return <div ref={editorRoot}></div>
}
