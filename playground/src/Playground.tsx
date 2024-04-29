import React, { useEffect, useState } from "react"
import { next as am } from "@automerge/automerge"
import { Editor } from "./Editor"
import { Repo } from "@automerge/automerge-repo"
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
  d.text = "Heading"
  am.splitBlock(d, ["text"], 0, { type: new am.RawString("heading"), attrs: {level: 1}, parents: []})
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
