# Stores belong to a List; grouping by Store is personal

A Product can now name the Store it is usually bought at, and the List screen can group by Store instead of by Category. That forced the open question from the spec: whose Stores are they?

A Store belongs to one List, like that List's Products (`store`: List, name, normalised name, unique per List). Every Member of the List sees and edits the same Stores, and a Product's default Store (`product.store_id`) is the same for all of them. Store names are free text that the Members type; no chain names are built in. Deleting a Store keeps its Products, without a Store (`ON DELETE SET NULL`). Store changes bump the List version and reach the other Members like any other change.

How a Member groups the List screen is theirs alone: `list_member.grouping` (`category` or `store`), set through `PUT /api/lists/{id}/grouping`, with no version bump and no event. In a shop one person reads the List by Store while another, at home, keeps Categories.

We rejected Stores per user (a shared Product would have a different Store for each Member) and a fixed set of chains (not every family shops at the same ones, and names differ by country). Department order per Store, the in-store mode and a Store on a single Entry are still later work.
