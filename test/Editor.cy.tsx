import React from 'react'
import { Editor } from './Editor'
import { unstable as automerge } from "@automerge/automerge"
import { DocHandle } from "./DocHandle"
import * as cy from "cypress/react18"

describe('<Editor />', () => {
  it('renders', () => {
    const doc = automerge.from({text: "Hello World"})
    const handle = new DocHandle(doc)
    cy.mount(<Editor handle={handle} path={["text"]}/>)
  })
})
