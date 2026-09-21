export type CheckpointNames = {
  checkpointTitle: string
  continuationTitle: string
}

export function requireExplicit(input: CheckpointNames): CheckpointNames {
  const checkpointTitle = requireTitle(input.checkpointTitle, "checkpointTitle")
  const continuationTitle = requireTitle(input.continuationTitle, "continuationTitle")
  if (checkpointTitle === continuationTitle) throw new Error("Checkpoint and continuation titles must differ.")
  return { checkpointTitle, continuationTitle }
}

function requireTitle(value: string, field: string) {
  const title = value.trim()
  if (!title) throw new Error(`${field} must not be empty.`)
  if (title.length > 200) throw new Error(`${field} must not exceed 200 characters.`)
  if (/\r|\n/.test(title)) throw new Error(`${field} must be a single line.`)
  return title
}
