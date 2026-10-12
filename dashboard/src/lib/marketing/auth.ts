// Same actor rules as Sales: a signed-in TRS user, or the cron bearer.
export { actor, json, NO_STORE } from '@/lib/sales/auth'
