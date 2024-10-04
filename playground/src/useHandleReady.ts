import { type DocHandle } from "@automerge/automerge-repo/slim"
import { useEffect, useState } from "react"

export function useHandleReady(handle: DocHandle<unknown>) {
  const [isReady, setIsReady] = useState(handle.isReady())
  useEffect(() => {
    if (!isReady) {
      handle
        .whenReady()
        .then(() => {
          setIsReady(true)
        })
        .catch(e => {
          console.error("Error waiting for handle to be ready", e)
        })
    }
  }, [handle])
  return isReady
}
