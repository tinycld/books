---
title: Audit log
summary: See who added, changed, posted, voided or deleted a Books record, and what each change was.
tags: [audit log, history, changes, reports]
order: 61
---

To see who changed a record, open the Audit Log, or open the record and choose More → Audit history.

## Open the Audit Log

To open the Audit Log, choose Reports in Books (the sidebar, or the Books menu on a phone), then press Audit Log. The heading shows your business name, Audit Log, the period, and your time zone, for example "Times in Central Time".

The Audit Log lists one row for each change that a person, or Books itself, made to a Books record: documents and their lines, journal entries, customers, vendors, products and services, accounts, taxes, banking, and the Books settings and access. The newest change is at the top. Sign-ins and other changes outside Books are not in the Audit Log; an admin sees them in Settings → Audit log.

Each row shows:

- Date changed: the day and the time to the minute, in your time zone, for example "Nov 14, 2026, 4:07 PM".
- User: the person who made the change. "System" is a change that no person made, such as a scheduled reversal that Books posted. A person who has been removed keeps their name.
- Event: what happened to the record.
- Record type: the kind of record, for example Invoice, Invoice line, Bill payment, Customer or Books settings.
- Record: the record's name when the change was made, for example "Invoice 1001" or "Invoice 1001: line 2".

The events are:

- Added: the record was made.
- Changed: a field of the record changed.
- Posted: the record's status changed to posted.
- Voided: the record's status changed to void.
- Deleted: the record was deleted.

A change to one line of a document or an entry shows as its own row, so you can see which line changed.

## Narrow the Audit Log

To change the dates, press the Date changed chip. The default is This month. Pick a preset, such as Today or Last month, pick All dates, or pick Custom and type the first and last day. The days are your own days: Today holds the changes made since midnight where you are.

To see the changes of some people only, press the User chip and pick one or more people. "System" is in the list too.

To see some events only, press the Event chip and pick one or more events, for example Posted and Voided.

To see some kinds of records only, press the Record type chip and pick one or more types. To hide the line rows, leave the line types out.

To sort the rows, press a column heading. Reset puts the newest change back at the top. To show or hide a column, press Customize.

The report stays current: a new change shows without a reload. A long log loads more rows when you scroll near the end.

## See the history of a record

To see every change to one record, press its row in the Audit Log. A line row opens the history of its document or entry.

On a window that is 1360 px wide or more, the history shows in a side panel beside the report, and the row that you pressed stays marked. Press another row to show its history in the same panel. To see the history on its own screen, press Open as full screen. To close the panel, press Close (✕) or Escape. On a narrower window and on a phone, the history opens as its own screen with a back link.

To see the history from the record itself, open the record and choose More → Audit history. It is the last item of the More menu of an invoice, estimate, sales receipt, bill or expense, a bill payment, a journal entry (posted, void, or a saved draft) and a customer page. When you can only read Books, the More menu of a customer page or a journal entry holds Audit history alone. On a document, More can also hold the other items that you can use, for example Download PDF on a phone, and Audit history comes after them. The history opens as its own screen.

The history shows the record's type and name. Press Open (for example Open invoice) to go to the record. When the record was deleted, the history says "This record was deleted on" and the day.

The events show newest first, each with its date and time, its user and its event:

- Changed, Posted and Voided show a table of Field, Before and After, one row for each field that changed. Amounts show as money, days as short days, yes or no fields as Yes or No, and a related record by its name today. A related record that no longer exists, or that you cannot read, shows "Removed record". An empty value shows "Empty". When only internal fields changed, the event reads "No visible fields changed".
- Added shows "Added" and the record's name.
- Deleted shows the record's last values in a table of Field and Value.

The history of a document or an entry also shows the events of its lines, for example "Line 2 — Changed", each with its own table.

A field that Books keeps private, such as a tax ID or the link token of an estimate, shows "Changed (hidden)" in Before and After. Nobody sees its values in the history, admins included.

The history shows 50 events. To see older events, press Show 50 more. A new change shows at the top while the history is open. On a phone, each changed field shows as a card with its name, then Before, then After.

## Who sees the Audit Log

Everyone who can read Books sees the Audit Log and the history of each record, read-only users and bookkeepers included. Each reader sees the changes to the records that they can read. A user without Books access does not see the Audit Log, and a link to a history shows "You need Books access to see a record's history."

For more on Books reports, see [Run and customize a report](help://books:reports).
