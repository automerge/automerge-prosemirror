import React, { useEffect, useState } from "react"
import { next as am } from "@automerge/automerge"
import { Editor } from "./Editor"
import { DocHandle, Repo } from "@automerge/automerge-repo"
//import { MessageChannelNetworkAdapter } from "@automerge/automerge-repo-network-messagechannel"
import { PausableNetworkAdapter } from "./PausableNetworkAdapter"

const { port1: leftToRight, port2: rightToLeft } = new MessageChannel()

const leftAdapter = new PausableNetworkAdapter(leftToRight)
const leftRepo = new Repo({
  //network: [new MessageChannelNetworkAdapter(leftToRight)],
  network: [leftAdapter],
})

const rightAdapter = new PausableNetworkAdapter(rightToLeft)
const rightRepo = new Repo({
  //network: [new MessageChannelNetworkAdapter(rightToLeft)],
  network: [rightAdapter],
})

const leftHandle = leftRepo.create()
leftHandle.change(d => {
  d.text = ""
  am.splitBlock(d, ["text"], 0, {
    type: new am.RawString("heading"),
    parents: [],
    attrs: { level: 1 },
  })
  am.splice(d, ["text"], 1, 0, "Heading")
  am.splitBlock(d, ["text"], 8, {
    type: new am.RawString("paragraph"),
    parents: [],
    attrs: {},
  })
  am.splice(d, ["text"], 9, 0, "some text")

  //am.splitBlock(d, ["text"], 0, {
  //type: "paragraph",
  //parents: ["blockquote", "unordered-list-item"],
  //attrs: {},
  //})
  //am.splice(d, ["text"], 1, 0, "some quote")
  //am.splitBlock(d, ["text"], 11, {type: "paragraph", parents: ["blockquote"], attrs: {}})
  //am.splice(d, ["text"], 12, 0, "middle")
  //am.splitBlock(d, ["text"], 18, {type: "unordered-list-item", parents: ["blockquote"], attrs: {}})

  //am.splitBlock(d, ["text"], 0, {
  //type: "ordered-list-item",
  //parents: [],
  //attrs: {},
  //})
  //am.splice(d, ["text"], 1, 0, "item one")
  //am.splitBlock(d, ["text"], 9, {
  //type: "ordered-list-item",
  //parents: ["ordered-list-item"],
  //attrs: {},
  //})
  //am.splice(d, ["text"], 10, 0, "item two")

  //am.splitBlock(d, ["text"], 0, { type: "paragraph", parents: [], attrs: {} })
  //am.splitBlock(d, ["text"], 1, {
  //type: "image",
  //parents: ["paragraph"],
  //attrs: {
  //src: "https://archive.org/services/img/Hubble_Andromeda_Galaxy_",
  //alt: "Andromeda Galaxy",
  //title: "Andromeda Galaxy",
  //isEmbed: true,
  //},
  //})
})

const rightHandle = rightRepo.find(leftHandle.url)

function Playground() {
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    if (!connected) {
      leftAdapter.pause()
    } else {
      leftAdapter.resume()
    }
  }, [connected])

  return (
    <div id="playground">
      <h1>Automerge + Prosemirror</h1>
      <label>
        Connected
        <input
          type="checkbox"
          checked={connected}
          onChange={e => setConnected(e.target.checked)}
        />
      </label>
      <div id="editors">
        <div className="editor">
          <Editor name="left" handle={leftHandle} path={["text"]} />
        </div>
        <div className="editor">
          <Editor name="right" handle={rightHandle} path={["text"]} />
        </div>
      </div>
    </div>
  )
}

export default Playground
