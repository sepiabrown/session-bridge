export type CheckpointNameRequest = {
  checkpointTitle: string
  continuationTitle?: string | undefined
}

export type CheckpointNames = {
  checkpointTitle: string
  continuationTitle: string
}

export function requireCheckpointTitle(value: string) {
  return requireTitle(value, "checkpointTitle")
}

export function completeNames(checkpointTitle: string, continuationTitle: string): CheckpointNames {
  const validatedCheckpoint = requireCheckpointTitle(checkpointTitle)
  const validatedContinuation = requireTitle(continuationTitle, "continuationTitle")
  if (validatedCheckpoint === validatedContinuation) {
    throw new Error("Checkpoint and continuation titles must differ.")
  }
  return { checkpointTitle: validatedCheckpoint, continuationTitle: validatedContinuation }
}

function requireTitle(value: string, field: string) {
  const title = value.trim()
  if (!title) throw new Error(`${field} must not be empty.`)
  if (title.length > 200) throw new Error(`${field} must not exceed 200 characters.`)
  if (/\r|\n/.test(title)) throw new Error(`${field} must be a single line.`)
  return title
}
