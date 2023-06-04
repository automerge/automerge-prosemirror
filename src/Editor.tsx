import React, {useEffect, useRef, useState} from "react"

import {Command, EditorState, Transaction} from "prosemirror-state"
import {keymap} from "prosemirror-keymap"
import {baseKeymap, toggleMark} from "prosemirror-commands"
import {history, redo, undo} from "prosemirror-history"
import {schema} from "prosemirror-schema-basic"
import {MarkType} from "prosemirror-model"
import {EditorView} from "prosemirror-view"
import {DocHandle, DocHandlePatchPayload, } from "automerge-repo"
import "prosemirror-view/style/prosemirror.css"
import {default as automergePlugin} from "./plugin"
import {ChangeFn, reconcile} from "./reconcile"
import {Extend, Heads, Patch, Prop} from "@automerge/automerge"
import {unstable as automerge} from "@automerge/automerge"
import { fromAm } from "./model"
import {intercept} from "./intercept"
import PatchSemaphore from "./PatchSemaphore"

export type EditorProps = {
  handle: DocHandle<any>
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
        automergePlugin(handle.doc, path),
      ],
      doc: fromAm(handle.doc, path)
    }

    const semaphore = new PatchSemaphore()
    let state = EditorState.create(editorConfig)
    const doChange = (fn: (d: automerge.Doc<any>) => void): automerge.Doc<any> => {
      handle.change(fn)
      return handle.doc
    }
    const view = new EditorView(editorRoot.current, {
      state,
      dispatchTransaction: (tx: Transaction) => {
        let newState = semaphore.intercept(automerge.getHeads(handle.doc), doChange, tx, view.state)
        view.updateState(newState)
      }
    })
    const onPatch = (p: DocHandlePatchPayload<any>) => {
      let newState = semaphore.reconcilePatch(p.patches, automerge.getHeads(p.after), view.state)
      view.updateState(newState)
    }
    handle.on("patch", onPatch)
    return () => {
      view.destroy()
      handle.off("patch", onPatch)
    }
  }, [])

  return <div ref={editorRoot}></div>

}
