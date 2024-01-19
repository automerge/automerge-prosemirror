import React from 'react'
import { next as am } from "@automerge/automerge"
import {DocHandle} from "./DocHandle"
import {Editor} from "./Editor"

const doc = am.from({ text: "Hello world" })
const handle = new DocHandle(doc)

function Playground() {
  return <div id="playground">
    Automerge + Prosemirror
    <div id="editors">
      <div className="editor">
        <Editor handle={handle} path={["text"]} />
      </div>
      <div className="editor">
        <Editor handle={handle} path={["text"]} />
      </div>
    </div>
  </div>
}

export default Playground
