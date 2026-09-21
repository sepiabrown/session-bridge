export type WorkingScopeRequest = {
  workingFolders: string[]
  worktreeSuffixDelimiter?: string | undefined
}

const defaultSuffixDelimiter = "___"
const titleFieldDelimiter = "~"

export function resolveWorkingScope(input: WorkingScopeRequest) {
  if (input.workingFolders.length === 0) throw new Error("workingFolders must contain at least one folder.")
  const delimiter = validateDelimiter(input.worktreeSuffixDelimiter ?? defaultSuffixDelimiter)
  const scopes = input.workingFolders.map((folder) => normalizeFolderScope(folder, delimiter))
  return [...new Set(scopes)].join("+")
}

export function scopeCheckpointTitle(scope: string, checkpointTitle: string) {
  return `${scope}${titleFieldDelimiter}${checkpointTitle}`
}

export function normalizeFolderScope(folder: string, delimiter = defaultSuffixDelimiter) {
  const value = folder.trim().replace(/[\\/]+$/, "")
  const basename = value.split(/[\\/]/).at(-1) ?? ""
  const delimiterIndex = basename.indexOf(validateDelimiter(delimiter))
  const semanticName = delimiterIndex < 0 ? basename : basename.slice(0, delimiterIndex)
  const scope = semanticName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  if (!scope) throw new Error(`Working folder ${JSON.stringify(folder)} has no semantic name before the suffix delimiter.`)
  return scope
}

function validateDelimiter(delimiter: string) {
  if (delimiter.length < 1 || delimiter.length > 16) {
    throw new Error("worktreeSuffixDelimiter must contain 1 to 16 characters.")
  }
  if (/[\s\\/\x00-\x1f\x7f]/.test(delimiter)) {
    throw new Error("worktreeSuffixDelimiter must not contain whitespace, path separators, or control characters.")
  }
  return delimiter
}
