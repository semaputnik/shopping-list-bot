# Shopping List

Shared shopping lists in a Telegram Mini App. People make lists, share them by link, and edit them together.

## Sharing

**List**:
A named shopping list. It is the only unit of sharing: there is no group, family or workspace above it.
_Avoid_: Household, family, group, workspace

**Member**:
A Telegram user who has joined a List, either as its creator or through its Share link. All Members of a List have equal rights. Any Member can leave the List or delete it for everyone.
_Avoid_: Participant, collaborator, owner, admin

**Share link**:
A link that opens the Mini App with a List's secret share code. Opening it makes the user a Member of that List.
_Avoid_: Invite, invitation

## What is on a List

**Product**:
Something that has been entered into a List at least once. Products make up the List's memory, which suggestions draw on. A Product belongs to exactly one List.
_Avoid_: Item, catalog item, position

**Entry**:
A Product currently on a List, waiting to be bought. A List can hold several Entries for the same Product.
_Avoid_: Item, line, position, list item

**Note**:
Free text on an Entry, such as an amount or a detail ("2 л", "крупные").
_Avoid_: Description, quantity, amount

**Category**:
One of a fixed, system-wide set of store departments that a Product is filed under ("Молочное", "Хлеб").
_Avoid_: Department, aisle, section

## Buying

**Checked**:
The state of an Entry that has been crossed off. Tapping again unchecks it. A Checked Entry is still on the List.
_Avoid_: Done, completed, bought

**Purchase**:
The set of Checked Entries removed from a List by one press of «Куплено», with the time it happened and the Member who pressed it. The Entries leave the List, and their Products stay in memory.
_Avoid_: Checkout, trip, order

**History**:
A List's record of its past Purchases.
_Avoid_: Log, archive, recently bought
