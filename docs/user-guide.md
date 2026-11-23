# ERP user guide

Open `/admin/login.html` to sign in with a staff account. The dashboard shows business totals, quick actions, recent transactions and Qist reminders. Select a summary card to open the corresponding records. The main menu opens each module. Sign out from the sidebar when finished.

## Used-bike business

1. Open **Stock → Purchase Bike** and enter the bike, seller, condition and cost details. Choose two or three photos. **Stock** shows the bike after you save. Its capital is the purchase price plus repair and other costs.
2. In **Stock**, use **Record work or cost** for additional repair, transport or paperwork. Expected profit is the asking price minus the bike's total cost. Select **List for sale** when the bike is ready for the public storefront. Shop staff can record a direct sale from **Sales → Sell Bike**.
3. Enter the buyer and payment details in **Sell Bike**. The saved bike moves to **Sold Bikes**. The receipt can be printed or opened as a WhatsApp draft. Real profit is the sold price minus the bike's total cost.
4. In **Settings → Payment**, choose the methods available at sale. For a Qist sale, enter the advance, monthly instalment and next due date. Enter the agreed flat interest rate as a percentage of the bike price. The sale form previews the total payable, remaining balance and last scheduled instalment. Use **Sales → Qist / Udhar** to record collections. The dashboard shows overdue plans and plans due in the next seven days.
5. Record shop expenses such as rent, tea and fuel in **Hisaab → Expenses**. **Hisaab → Profit Report** deducts these expenses from resale profit. For mechanic work on a specific bike, record the cost on that bike in **Stock**.
6. In **Customers**, select **View purchases** to see the customer’s bike purchases and remaining Qist balance.
7. **Stock**, **Sold Bikes**, **Customers** and **Profit Report** export the current filters to CSV or Excel. In any filtered view, use **×** next to a field to clear it or **Reset all filters** to restore the full list.

On desktop, drag the sidebar edge to resize it or select **Collapse sidebar**. The browser remembers both settings. On mobile, open it from the menu button.

## Everyday workflows

- **Add products.** Open Inventory, set up categories and brands if needed, then choose **Add product**. Enter the SKU, pricing and opening stock. From the product table, select a product name to edit it if you have management access.
- **Adjust and review stock.** Use **Stock adjustment** to add, subtract or set stock with a written reason. Use **Stock audit** to compare stock on hand with the balance from the latest movement.
- **Sell and handle returns.** Open **Point of sale**, add product lines and enter the payment details. Complete the sale and review its invoice. For a return, open **Returns**, find the invoice by number, select the item and enter its condition and quantity.
- **Order from suppliers.** Add the supplier first, then create a new purchase. Record received stock from the purchase list. Use purchase returns for items going back to a supplier.
- **Run workshop jobs.** Create a customer and add their motorcycle, or enter walk-in details on a new job card. Add services or parts and assign a mechanic. Enter the last and next oil-change dates when creating or editing a job card. A new job for a registered motorcycle carries forward its recorded dates when left blank. Move the job through status changes from **Job cards**. Use **Repair history** to review closed jobs.
- **Fulfil online orders.** Open **Online orders**, review the order and confirm stock. Move it through processing, shipping and delivery, and enter a tracking number when available.
- **Review finances.** Use **Payments**, **Expenses**, **General ledger** and **Trial balance** for recorded transactions and postings. Use **Reports** to review activity by date and **Profit** for operating summaries.
- **Manage access and settings.** Use **Users** to inspect roles and account status. Use **Settings** to edit business details, sales tax defaults and document prefixes.

## Custom route permissions

Open **Users** and select **Route permissions** on a staff account. Each route group can inherit the assigned role, be explicitly allowed, or be explicitly denied. Pair write access with the related view permissions when an operation needs a list or lookup. Owners can customize other staff accounts. Admins can customize subordinate staff within their own effective permissions.

## Buy and sell motorcycles

1. In **Inventory**, select **Add motorcycle** and enter its SKU, name, selling price and any model-year or engine details. Motorcycle stock is counted by SKU.
2. Open **Purchases → Buy motorcycles**, select the bike and enter quantity, supplier and unit cost. Save the purchase and use **Receive** on the purchase list when the bikes arrive.
3. Customers open the storefront **Motorcycles** catalogue, add an available bike to their cart and submit checkout. Staff confirm the order in **Online orders** to deduct the units from stock.

## Customer orders

Browse spare parts on the public site and add products to the cart. At checkout, provide contact and shipping details and choose a preferred payment method. Save the order number shown on the tracking page. The shop confirms availability and arranges payment and delivery.

See the [setup guide](setup.md) if pages show that the database is unavailable.
