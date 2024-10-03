export function isArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function isPrefixOfArray<T>(prefix: T[], a: T[]): boolean {
  if (prefix.length > a.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== a[i]) return false
  }
  return true
}
