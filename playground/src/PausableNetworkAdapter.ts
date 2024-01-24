import {
  Message,
  NetworkAdapterEvents,
  NetworkAdapterInterface,
  PeerId,
  PeerMetadata,
  RepoMessage,
} from "@automerge/automerge-repo"
import EventEmitter from "eventemitter3"

import debug from "debug"

export class PausableNetworkAdapter
  extends EventEmitter<NetworkAdapterEvents>
  implements NetworkAdapterInterface
{
  channels = {}
  messagePort: MessagePort
  peerId?: PeerId
  peerMetadata?: PeerMetadata
  #startupComplete = false
  #log: debug.Debugger
  #connectedPeers: Set<PeerId> = new Set()

  constructor(messagePort: MessagePort) {
    super()
    this.#log = debug("prosemirror-playground:pausable")
    this.messagePort = messagePort
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
    this.#log("messageport connecting")
    this.peerId = peerId
    this.peerMetadata = peerMetadata
    this.messagePort.start()
    this.messagePort.addEventListener(
      "message",
      (e: { data: MessageChannelMessage }) => {
        this.#log("message port received %o", e.data)

        const message = e.data
        if ("targetId" in message && message.targetId !== this.peerId) {
          throw new Error(
            "MessagePortNetwork should never receive messages for a different peer.",
          )
        }

        const { senderId, type } = message

        switch (type) {
          case "arrive":
            {
              const { peerMetadata } = message as ArriveMessage
              this.messagePort.postMessage({
                type: "welcome",
                senderId: this.peerId,
                peerMetadata: this.peerMetadata,
                targetId: senderId,
              })
              this.#connectedPeers.add(senderId)
              this.announceConnection(senderId, peerMetadata)
            }
            break
          case "welcome":
            {
              this.#connectedPeers.add(senderId)
              const { peerMetadata } = message as WelcomeMessage
              this.announceConnection(senderId, peerMetadata)
            }
            break
          case "leave":
            {
              const { senderId } = message
              this.emit("peer-disconnected", { peerId: senderId })
            }
            break
          default:
            if (!("data" in message)) {
              this.emit("message", message)
            } else {
              this.emit("message", {
                ...message,
                data: message.data ? new Uint8Array(message.data) : undefined,
              })
            }
            break
        }
      },
    )

    this.messagePort.postMessage({
      senderId: this.peerId,
      type: "arrive",
      peerMetadata,
    })

    // Mark this messagechannel as ready after 50 ms, at this point there
    // must be something weird going on on the other end to cause us to receive
    // no response
    setTimeout(() => {
      if (!this.#startupComplete) {
        this.#startupComplete = true
        this.emit("ready", { network: this })
      }
    }, 100)
  }

  send(message: RepoMessage) {
    if ("data" in message) {
      const data = message.data.buffer.slice(
        message.data.byteOffset,
        message.data.byteOffset + message.data.byteLength,
      )

      this.messagePort.postMessage(
        {
          ...message,
          data,
        },
        [data],
      )
    } else {
      this.messagePort.postMessage(message)
    }
  }

  announceConnection(peerId: PeerId, peerMetadata: PeerMetadata) {
    if (!this.#startupComplete) {
      this.#startupComplete = true
      this.emit("ready", { network: this })
    }
    this.emit("peer-candidate", { peerId, peerMetadata })
  }

  pause() {
    for (const peer of this.#connectedPeers) {
      this.messagePort.postMessage({
        type: "leave",
        senderId: this.peerId,
        targetId: peer,
      })
      this.emit("peer-disconnected", { peerId: peer })
    }
  }

  resume() {
    for (const peer of this.#connectedPeers) {
      this.messagePort.postMessage({
        type: "arrive",
        senderId: this.peerId,
        peerMetadata: this.peerMetadata,
        targetId: peer,
      })
    }
  }

  disconnect() {
    // TODO
    throw new Error("Unimplemented: leave on MessagePortNetworkAdapter")
  }
}

export interface MessageChannelNetworkAdapterConfig {
  /**
   * This is an optional parameter to use a weak ref to reference the message port that is passed to
   * the adapter. This option is useful when using a message channel with a shared worker. If you
   * use a network adapter with `useWeakRef = true` in the shared worker and in the main thread
   * network adapters with strong refs the network adapter will be automatically garbage collected
   * if you close a page. The garbage collection doesn't happen immediately; there might be some
   * time in between when the page is closed and when the port is garbage collected
   */
  useWeakRef?: boolean
}

/** Notify the network that we have arrived so everyone knows our peer ID */
type ArriveMessage = {
  type: "arrive"

  /** The peer ID of the sender of this message */
  senderId: PeerId

  /** The peer metadata of the sender of this message */
  peerMetadata: PeerMetadata

  /** Arrive messages don't have a targetId */
  targetId: never
}

/** Respond to an arriving peer with our peer ID */
type WelcomeMessage = {
  type: "welcome"

  /** The peer ID of the recipient sender this message */
  senderId: PeerId

  /** The peer metadata of the sender of this message */
  peerMetadata: PeerMetadata

  /** The peer ID of the recipient of this message */
  targetId: PeerId
}

type LeaveMessage = {
  type: "leave"
  senderId: PeerId
  targetId: PeerId
}

type MessageChannelMessage =
  | ArriveMessage
  | WelcomeMessage
  | Message
  | LeaveMessage
