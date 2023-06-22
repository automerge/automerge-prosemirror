// ***********************************************************
// This example support/component.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:

// Alternatively you can use CommonJS syntax:
// require('./commands')

import { mount } from "cypress/react18"

// Augment the Cypress namespace to include type definitions for
// your custom command.
// Alternatively, can be defined in cypress/support/component.d.ts
// with a <reference path="./component" /> at the top of your spec.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mount: typeof mount
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selection(fn: (query: JQuery<any>) => void): Chainable<Element>
      setSelection(query: string, endQuery?: string): Chainable<Element>
      setCursor(query: string, atStart?: boolean): Chainable<Element>
      setCursorBefore(query: string): Chainable<Element>
      setCursorAfter(query: string): Chainable<Element>
    }
  }
}

import "./selection-command"
//require("./selection-command")

Cypress.Commands.add("mount", mount)

// Example use:
// cy.mount(<MyComponent />)
