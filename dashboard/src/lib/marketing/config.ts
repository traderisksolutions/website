// Which parts of the Marketing workflow are switched on.
//
//   Engine           CONTENT_ENGINE_URL + CONTENT_ENGINE_SECRET (Cloud Run trs-content-engine)
//   Search Console   GOOGLE_GSC_CLIENT_ID/_SECRET, or the Gmail OAuth client with the
//                    /api/marketing/gsc/callback URL registered on it
import { engineConfigured, engineHealth } from './engine'
import { gscConfigured } from './gsc/client'
import type { MarketingStatus } from './types'

export async function marketingStatus(probe = false): Promise<MarketingStatus> {
  const engine = engineConfigured()
  let engineReachable: boolean | null = null
  if (engine && probe) engineReachable = (await engineHealth()).ok
  return { engine, engineReachable, gsc: gscConfigured() }
}
