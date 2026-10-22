export type OpenCodeMessage = {
  info:
    | { id: string; sessionID: string; role: "user" }
    | { id: string; sessionID: string; role: "assistant"; parentID: string }
  parts: unknown[]
}

export type OpenCodeSession = {
  id: string
  title: string
}

type RequestResult<T> = Promise<{ data?: T; error?: unknown }>

export type OpenCodeClient = {
  session: {
    list(input?: { query?: { directory?: string; limit?: number } }): RequestResult<OpenCodeSession[]>
    get(input: { path: { id: string }; query?: { directory?: string } }): RequestResult<OpenCodeSession>
    messages(input: {
      path: { id: string }
      query?: { directory?: string; limit?: number }
    }): RequestResult<OpenCodeMessage[]>
    message(input: {
      path: { id: string; messageID: string }
      query?: { directory?: string }
    }): RequestResult<OpenCodeMessage>
    fork(input: {
      path: { id: string }
      query?: { directory?: string }
      body?: { messageID?: string }
    }): RequestResult<OpenCodeSession>
    update(input: {
      path: { id: string }
      query?: { directory?: string }
      body?: { title?: string }
    }): RequestResult<OpenCodeSession>
  }
}

export async function unwrap<T>(request: RequestResult<T>, action: string): Promise<T> {
  const result = await request
  if (result.data !== undefined) return result.data
  throw new Error(`Failed to ${action}: ${formatError(result.error)}`)
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return JSON.stringify(error ?? "OpenCode returned no data")
}
