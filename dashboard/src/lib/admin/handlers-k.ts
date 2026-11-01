/** Knowledge agents register here: the depositor (the ledger's only writer). The fact distiller is knowledge_keeper in handlers-a. */
import { register } from '@/lib/agent-tasks/runner'
import { depositTask } from './k/deposit'

register('knowledge_depositor', depositTask)
