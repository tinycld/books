---
title: 1099 tracking
summary: Mark vendors for 1099 reporting, keep their legal names and tax IDs, map expense accounts to 1099 boxes and set the reporting threshold.
tags: [1099, vendors, tax ID, W-9, threshold]
order: 32
---

Books keeps the data that you need for 1099 forms: which vendors you report, their legal names and tax IDs, which accounts count toward which 1099 box, and the reporting threshold.

## To track a vendor for 1099

1. Open the vendor. For help with vendors, see [Vendors](help://books:vendors).
2. Turn on Track payments for 1099. The 1099 fields show below it.
3. Fill in the fields from the vendor's W-9:
   - Legal name: the name on the vendor's W-9, if it is not the display name.
   - Tax ID type: choose EIN (business) or SSN or ITIN (person).
   - Tax ID: the 9 digits of the EIN, SSN or ITIN.
4. Choose Save.

A tax ID has 9 digits. You can type it with or without spaces and dashes. Books stores it with the dashes of its type, for example 12-3456789 for an EIN and 123-45-6789 for an SSN. If you type a tax ID, you must also choose its Tax ID type.

You can track a vendor before its W-9 arrives and add the tax ID later. If you turn off Track payments for 1099, the 1099 fields hide, but Books keeps what you typed in them. Books still checks the hidden values when you save. If one of them is not correct, Save shows the message above the form. Turn on Track payments for 1099 to correct the value.

## To map accounts to 1099 boxes

1. Open Settings → 1099s.
2. In Accounts reported on 1099s, find the account. An inactive account shows only when it already has a box.
3. Choose a 1099 box for it, or choose Not reported.

Only Cost of goods sold, Expense and Other expense accounts take a 1099 box. Books saves your choice at once. Each account has one box at most, and many accounts can use the same box. A sub-account has its own box and does not use the box of its parent. A person with Bookkeeper or Admin access can change the boxes. Other people see the box names but cannot change them.

## To set the 1099 reporting threshold

1. Open Settings → 1099s.
2. In Reporting threshold, type the amount in 1099 reporting threshold.
3. Choose Save.

Books keeps the threshold for the 1099 report, which is not available yet. Only a Books admin can change the threshold. Other people see the amount but cannot change it.

## To review your 1099 vendors

Open Settings → 1099s. The 1099 vendors list shows each vendor that you track, with inactive vendors marked Inactive. For each vendor, the list shows the last four digits of the tax ID, or Missing tax ID when the vendor has no tax ID. To open a vendor, choose its row.

## Tax IDs and the audit log

The audit log shows that a tax ID changed, but it never shows the old or the new value.

For the other settings, see [Settings](help://books:settings).
