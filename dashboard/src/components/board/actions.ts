import type { BoardTask, TaskInput } from '@/lib/crm/board'

/** What any part of the board may do to a task. The board applies it optimistically and syncs. */
export interface BoardActions {
  addTask: (companyId: string, input: TaskInput) => Promise<BoardTask | null>
  updateTask: (taskId: string, patch: TaskInput) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
}
