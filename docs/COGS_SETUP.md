# 💰 COGS SETUP GUIDE

Cost of Goods Sold (COGS) is the backbone of ANOTAI's profitability engine.

## 1. Why COGS matters
Without COGS, the **Margin Guardian** is blind. It will default to "Manual Approval Only" for every discount to prevent potential losses.

## 2. Setting up COGS
1. Go to the **Inventory** tab.
2. Click **Sync from Shopify** to pull your latest product list.
3. For each variant, enter the **Unit Cost**.
   - *Example*: If you sell a moisturizer for $50 but it costs you $10 to make/buy, enter $10.
4. Click **Save Changes**.

## 3. CSV Import (Bulk)
If you have hundreds of products:
1. Export your product list as CSV.
2. Ensure columns `Variant ID` and `Cost` are present.
3. Upload the CSV via the **Import COGS** button.

## 4. Margin Calculations
- **Gross Profit** = Price - Cost
- **Net Margin %** = (Gross Profit / Price) * 100
- **Anotai Safety Zone**: If Net Margin % drops below 20% after a discount, the action is flagged as "Unsafe".
