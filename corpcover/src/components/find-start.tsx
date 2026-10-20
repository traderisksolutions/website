"use client";

import { useEffect } from "react";
import { openStart } from "./start-actions";

/** Opens the Find questionnaire when /find loads, and offers a button to reopen it. */
export function FindStart() {
  useEffect(() => { const t = window.setTimeout(() => openStart("finder"), 250); return () => window.clearTimeout(t); }, []);
  return <button type="button" onClick={() => openStart("finder")} className="btn btn-primary">Start the questions</button>;
}
