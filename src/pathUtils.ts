import { next as am } from "@automerge/automerge"

export function pathsEqual(left: am.Prop[], right: am.Prop[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

export function pathIsPrefixOf(prefix: am.Prop[], path: am.Prop[]): boolean {
  if (prefix.length > path.length) {
    return false
  }
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) {
      return false
    }
  }
  return true
}
