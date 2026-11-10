---
title: Sales tax
summary: Set up the sales tax you collect: agencies, rates, groups, the default for new sales, taxable products and exempt customers.
tags: [sales tax, tax rates, tax groups, tax agencies, exempt customers, taxable products]
order: 33
---

To collect sales tax, set up each agency that you pay sales tax to, then add the rates that each agency charges. If you charge several rates together, combine them in a group. Then choose the default for new sales, mark the products that are taxable, and mark the customers that are exempt.

To open the sales tax setup, choose Taxes in the sidebar. On a phone, swipe in from the left edge of the screen to open the sidebar, then choose Taxes. The page is called Sales tax. A read-only user can see the page, but cannot change it and sees the default as text.

## Add an agency

An agency is the government body that you pay sales tax to, such as a state, a county or a city. To add one, choose Add agency. Type its name and choose its liability account, then choose Add agency in the dialog.

The liability account is the account that all the tax you collect for the agency goes to. Only active Other current liability accounts are offered, and when you add an agency, Books chooses the first Sales tax payable account for you. If your chart has no active Other current liability account, the dialog says "Your chart has no sales tax liability account." To make one, choose Create Sales tax payable account. Books adds the account and chooses it. To learn what you can and cannot change on that account later, see [Chart of Accounts](help://books:chart-of-accounts).

Each agency shows as a card with its name and "Tax goes to" followed by its liability account. To change the agency, open the menu on its card and choose Edit agency.

Agency names must be unique, and case is ignored.

## Add a rate

A rate is a percentage that one agency charges. To add one, choose Add rate on the agency's card. Type a name and the rate as a percentage from 0 to 100, with up to four decimals, such as 8.875. The dialog shows the tax on $100.00 as you type. Then choose Add rate in the dialog. The agency is already chosen; you can choose another active agency.

To change a rate, open the menu on its row and choose Edit.

A rate name must be unique among all rates and groups, and case is ignored. An agency with no rates shows "No rates yet." An agency whose rates are all inactive shows "No active rates." while Show inactive is off.

## Combine rates in a group

A group is two to ten rates that you charge together as one choice, such as a state rate, a county rate and a city rate. To add one, choose Add group. Type a name and select its rates, then choose Add group in the dialog. The dialog shows the combined rate and the tax on $100.00. Books calculates the tax of each rate in the group separately, rounds it to the cent, and then adds the amounts.

Groups show on the Tax groups card, with their rates listed under each name. You can add a group when you have at least two active rates. A group cannot contain another group.

## Set the default for new sales

The Default for new sales card shows when you have at least one active rate. Choose a rate or a group in it, or choose None for no default. Books saves your choice immediately, and the row shows a Default badge. Invoices and sales receipts start with this tax unless the customer has its own default. To see how an invoice shows and prints its tax, see [Invoices](help://books:invoices).

You can also open the menu on a rate or group row and choose Make default or Remove default. Only an active rate or group can be the default.

## Make inactive and delete

To hide an agency, rate or group that you no longer use, open its menu and choose Make inactive. Inactive items do not show until you turn on Show inactive. To use one again, open its menu and choose Make active. An inactive agency's card has no Add rate.

To delete one, open its menu, choose Delete, then confirm in the dialog. When you delete a rate or a group, customers whose default it is lose that default.

## Mark products taxable

On a product or service, turn on Taxable to charge sales tax on the item when you sell it. A new Non-inventory item starts taxable, and a new Service does not. A bundle has no Taxable setting, because each item in it has its own. See [Products and services](help://books:products-services).

## Mark a customer exempt

On a customer, turn on This customer is tax exempt, then choose an Exemption reason and type the Exemption certificate number, up to 100 characters. While the customer is exempt, the form hides Default sales tax. A customer that is not exempt can have a Default sales tax, which is used for the customer instead of the default for new sales. See [Customers](help://books:customers).

## When Books says no

Books refuses some changes and tells you why. Here is what each message means and what to do. A number in a message is a count, and a name in “…” is the name of your agency, rate or group.

- "This agency has 1 tax rate. Delete it or move it to another agency first." or "This agency has 3 tax rates. Delete them or move them to another agency first." You cannot delete an agency that has rates. Delete its rates, or edit each rate and choose another agency.
- "Make its 1 active rate inactive first." or "Make its 2 active rates inactive first." You cannot make an agency inactive while it has active rates. Make the rates inactive first.
- "This rate is in the group “…”. Remove it from the group first." You cannot delete a rate that a group holds. Edit the group and clear the rate, or delete the group.
- "This rate is in 3 groups. Remove it from them first." You cannot delete a rate that groups hold. Edit each group that holds the rate and clear the rate, or delete those groups. Turn on Show inactive to see the inactive groups too.
- "Remove it from the group “…” or make the group inactive first." You cannot make a rate inactive while an active group holds it. Edit the group and clear the rate, or make the group inactive.
- "Remove it from its 2 active groups or make them inactive first." You cannot make a rate inactive while active groups hold it. Edit each active group that holds the rate and clear the rate, or make those groups inactive.
- "This is the default for new sales. Choose another default first." You cannot delete the default, or make it inactive. Choose another default, or choose None, first.
- "Only an active rate or group can be the default." The rate or group is inactive, for example because someone made it inactive while you chose it. Make it active first, or choose an active rate or group.
- "An agency named “…” already exists." or "A tax rate or group named “…” already exists." Choose another name.
- "Choose at least two rates." or "A group holds at most ten rates." A group needs two to ten rates.
- "“…” is inactive." A rate that you added to a group is inactive, for example because someone made it inactive while you edited the group. Clear that rate in the group, or make the rate active first.
- "Each rate can be in a group once." The group lists the same rate two times. Select each rate in the group one time only.
- "The agency is inactive." A rate needs an active agency. Make the agency active, or choose another agency.
- "The liability account is inactive." or "The liability account must be an Other current liability account." Choose an active Other current liability account for the agency.
- "Choose an exemption reason." An exempt customer needs a reason. Choose one in Exemption reason.
- "The default sales tax does not exist." The customer's Default sales tax was deleted, for example by someone else while you edited the customer. Choose another rate or group for the customer, or None.
- "The default sales tax is inactive." Choose an active rate or group for the customer, or None.
