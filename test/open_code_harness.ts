import type { OpenCodeClient, OpenCodeMessage, OpenCodeSession } from "../src/open_code_contract.ts"

type StoredSession = OpenCodeSession & { messages: OpenCodeMessage[] }

export class OpenCodeHarness implements OpenCodeClient {
  readonly sessions = new Map<string, StoredSession>()
  failContinuationRename = false
  private forkNumber = 0

  readonly session = {
    list: async () =>
      this.response([...this.sessions.values()].map(({ messages: _messages, ...session }) => session)),
    get: async (input: { path: { id: string } }) => this.response(this.requireSession(input.path.id)),
    messages: async (input: { path: { id: string } }) =>
      this.response(structuredClone(this.requireSession(input.path.id).messages)),
    fork: async (input: { path: { id: string }; body?: { messageID?: string } }) => {
      const source = this.requireSession(input.path.id)
      const boundary = input.body?.messageID
      const boundaryIndex = boundary ? source.messages.findIndex((message) => message.info.id === boundary) : -1
      const count = boundaryIndex < 0 ? source.messages.length : boundaryIndex
      const id = `fork-${++this.forkNumber}`
      const messages = source.messages.slice(0, count).map((message, index) => ({
        ...structuredClone(message),
        info: { ...structuredClone(message.info), id: `${id}-message-${index}`, sessionID: id },
      })) as OpenCodeMessage[]
      const fork = { id, title: `${source.title} (forked)`, messages }
      this.sessions.set(id, fork)
      return this.response(fork)
    },
    update: async (input: { path: { id: string }; body?: { title?: string } }) => {
      if (this.failContinuationRename && input.path.id === "source") {
        return { error: new Error("continuation rename failed") }
      }
      const session = this.requireSession(input.path.id)
      if (input.body?.title) session.title = input.body.title
      return this.response(session)
    },
  }

  addSession(session: StoredSession) {
    this.sessions.set(session.id, structuredClone(session))
  }

  private requireSession(id: string) {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`Missing fake OpenCode session ${id}.`)
    return session
  }

  private response<T>(data: T) {
    return { data: structuredClone(data) }
  }
}

export function checkpointConversation(): OpenCodeMessage[] {
  return [
    user("user-1"),
    assistant("assistant-1", "user-1"),
    user("checkpoint-request"),
    assistant("checkpoint-response", "checkpoint-request"),
  ]
}

function user(id: string): OpenCodeMessage {
  return { info: { id, sessionID: "source", role: "user" }, parts: [] }
}

function assistant(id: string, parentID: string): OpenCodeMessage {
  return { info: { id, sessionID: "source", role: "assistant", parentID }, parts: [] }
}
