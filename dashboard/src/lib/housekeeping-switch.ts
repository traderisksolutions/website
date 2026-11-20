/**
 * The filing agent's switch (Jarod, 20 Nov 2026: "switch off housekeeping"). Off unless the env
 * var HOUSEKEEPING is "on". Off means nothing files mail by itself: no signature reads, no company
 * from a domain or subject on arrival, no autofile, no resolver agent, no nightly client-link sweep.
 * A person can still file, merge and attach by hand.
 */
export const housekeepingOn = (): boolean => process.env.HOUSEKEEPING === 'on'

/**
 * The client link by rule (Jarod, 20 Nov 2026): "(TRS) ECICS – CCCC (Dover Show Flat CAR)" names its
 * client by code, with no model, so it runs while housekeeping is off. On unless CLIENT_LINK_RULES is "off".
 */
export const clientLinkRulesOn = (): boolean => process.env.CLIENT_LINK_RULES !== 'off'
