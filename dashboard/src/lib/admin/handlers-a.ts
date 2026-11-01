/** Phase A agents register here: intake, resolver, document_clerk, policy_reader, knowledge_keeper. */
import { register } from '@/lib/agent-tasks/runner'
import { skip } from '@/lib/agent-tasks/queue'
import { intakeMessage, readCase } from './a/intake'
import { resolveTask } from './a/resolver'
import { fileAttachments } from './a/document-clerk'
import { readPolicyDocument } from './a/policy-reader'
import { knowledgeTask } from './a/knowledge'

register('intake', async task => {
  if (task.kind === 'message') return intakeMessage(task)
  if (task.kind === 'read_case') return readCase(task)
  await skip(task.id, `unknown kind ${task.kind}`)
  return 'handled'
})
register('resolver', resolveTask)
register('document_clerk', fileAttachments)
register('policy_reader', readPolicyDocument)
register('knowledge_keeper', knowledgeTask)
