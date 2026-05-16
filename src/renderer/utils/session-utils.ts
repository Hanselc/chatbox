import type { Session, SessionMeta } from '@shared/types'
import { mapValues } from 'lodash'
import { migrateMessage } from '../../shared/utils/message'

export function migrateSession(session: Session): Session {
  return {
    ...session,
    settings: {
      // temperature未设置的时候使用默认值undefined，这样才能覆盖全局设置
      temperature: undefined,
      ...session.settings,
    },
    messages: session.messages?.map((m) => migrateMessage(m)) || [],
    threads: session.threads?.map((t) => ({
      ...t,
      messages: t.messages.map((m) => migrateMessage(m)) || [],
    })),
    messageForksHash: mapValues(session.messageForksHash || {}, (forks) => ({
      ...forks,
      lists:
        forks.lists?.map((list) => ({
          ...list,
          messages: list.messages?.map((m) => migrateMessage(m)) || [],
        })) || [],
    })),
  }
}

export function sortSessions(sessions: SessionMeta[]): SessionMeta[] {
  const valid = sessions.filter((s) => !s.hidden)

  const pinnedWithOrder: SessionMeta[] = []
  const pinnedWithoutOrder: SessionMeta[] = []
  const reversedWithOrder: SessionMeta[] = []
  const reversedWithoutOrder: SessionMeta[] = []

  for (const sess of valid) {
    if (sess.starred) {
      if (sess.sortOrder !== undefined) {
        pinnedWithOrder.push(sess)
      } else {
        pinnedWithoutOrder.push(sess)
      }
    } else {
      if (sess.sortOrder !== undefined) {
        reversedWithOrder.push(sess)
      } else {
        reversedWithoutOrder.push(sess)
      }
    }
  }

  // Sort sessions that have sortOrder by descending value (higher = first in display)
  const sortByOrderDesc = (a: SessionMeta, b: SessionMeta) => (b.sortOrder! - a.sortOrder!)
  pinnedWithOrder.sort(sortByOrderDesc)
  reversedWithOrder.sort(sortByOrderDesc)

  // For sessions without sortOrder, preserve original reverse-array behavior
  const reversed: SessionMeta[] = []
  for (const sess of reversedWithoutOrder) {
    reversed.unshift(sess)
  }

  return pinnedWithOrder.concat(pinnedWithoutOrder, reversedWithOrder, reversed)
}
