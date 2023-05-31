import { useDocument, useHandle } from "automerge-repo-react-hooks"
import { DocumentId } from "automerge-repo"
import { Editor } from "./Editor"
import {useEffect, useState} from "react"
interface Doc {
  count: number
  text: string
}

export function App(props: { documentId: DocumentId }) {
  const handle = useHandle<Doc>(props.documentId)
  const [doc, changeDoc] = useDocument<Doc>(props.documentId)
  const [docReady, setDocReady] = useState(false)

  useEffect(() => {
    handle.value().then((doc) => {
      setDocReady(true)
    })
  })

  if (!docReady) {
    return <div>Loading...</div>
  } else {
    return (
      <><button
        onClick={() => {
          changeDoc((d: any) => {
            d.count = (d.count || 0) + 1
          })
        }}
      >
        count is: {doc?.count ?? 0}
      </button>
      <Editor handle={handle} path={["text"]}/>
    </>
    )
  }
}

export default App
