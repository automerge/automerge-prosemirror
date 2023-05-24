import { useDocument, useHandle } from "automerge-repo-react-hooks"
import { DocumentId } from "automerge-repo"
import { Editor } from "./Editor"
interface Doc {
  count: number
  text: string
}

export function App(props: { documentId: DocumentId }) {
  const handle = useHandle<Doc>(props.documentId)
  const [doc, changeDoc] = useDocument<Doc>(props.documentId)

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
    <Editor handle={handle} attribute={"text"}/>
    </>
  )
}

export default App
