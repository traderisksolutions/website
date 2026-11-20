# Filing

One record per file (`policy_documents`) and one Drive tree for every line. Decided by Jarod, 20 Nov 2026: a person's File button now; the filing agent later writes the same record. Mail filing by the agent stays off.

## Drive tree

```
<root>/<Group>/
  <Line>/                          fixed list, src/lib/renewals/lines.ts
    <Plan year · Insurer>/         2027–28 · QBE
      Census/ Policy/ Billing/ Quotes/ Claims/ Other/
  To sort/                         no policy yet
  Letters/                         a letter of appointment with no policy
```

- Group: the top of the client's group (`companies.parent_id`). A group's entities share one folder.
- Line: the policy's confirmed `line_code`, else the line its class of insurance names.
- Plan year: the policy's start year, `2027–28`.
- Insurer: one folder per insurer however the policy spells it (`insurerFolder`: "QBE Insurance (Singapore) Pte Ltd" → QBE). A Malaysian entity keeps "Malaysia".
- Folder by type (`folderForType`): member list and movement → Census; schedule, wording, cover note, endorsement, certificate, benefit summary, bond, renewal notice → Policy; debit and credit notes, payment advice → Billing; quotation, proposal form, claims history, contract requirements, company documents, survey → Quotes; claim → Claims.
- The policy's `drive_folder_url` points at its plan-year folder.
- Code: `src/lib/filing/tree.ts` (pure, tested), `src/lib/documents/drive.ts` (writes it).

## Record

`policy_documents` (data room) plus, from `20261121_tree_filing.sql`: `line_code`, `plan_year`, `filed_by` (the person who pressed File; null by rule), `filed_at`.

## File button

`<FileButton attachmentId>` on an email attachment, `<FileButton documentId>` on a data-room row (`src/components/filing`). The dialog shows File, Company, Line, Type, Policy, Plan year and Saves to.

| Call | Does |
| --- | --- |
| `GET /api/filing?attachment=` or `?document=` (`&company=`) | Suggestion by rules: the company from the placement, the client the thread is about (`thread_insurers.client_company_id`), then the thread's company; never an insurer or partner. Type from the file name. Policy from the placement, the existing record, or the client's one live policy. |
| `POST /api/filing` `{ attachment_id \| document_id, company_id, policy_id, doc_type }` | Writes the record (one per attachment), files or moves it in Drive (same file id, same link), records the line, plan year and the person. |

No model is called. A file on a colleague's private thread answers 403, as the thread does. The same bytes already filed for the company are not filed twice.

## Moving what is filed

`scripts/move-filed-to-tree.ts`: dry run by default; `--apply` moves every filed document into the tree and an entity's own Employment Benefits folder into its group's. Nothing is deleted; emptied folders stay. Undo log: `~/trs-move-filed-to-tree.jsonl`.

Dry run, 21 Nov 2026: 4,126 filed documents; 3,708 have no policy (To sort); 52 letters; the rest by line and plan year. 1,458 sit under an insurer (1,046) or partner (412) company, not the client: the File button corrects them one at a time.

## Order to ship

1. Apply `20261121_tree_filing.sql` with the runner (Jarod's go). The code writes the new columns.
2. Deploy.
3. Move script: dry run, then `--apply` (Jarod's go).
4. Mount `FileButton` in the Inbox attachment chips and the company data room.
