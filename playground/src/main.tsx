import React from "react"
import ReactDOM from "react-dom/client"
import Playground from "./Playground"
import "./playground.css"

//@ts-ignore
const demoMode = import.meta.env.PROD

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Playground demoMode={demoMode} />
  </React.StrictMode>,
)
