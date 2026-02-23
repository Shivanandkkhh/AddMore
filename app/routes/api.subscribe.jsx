import {  redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();

    const type = formData.get("type"); // "block" or "bundle"
    const referenceId = formData.get("referenceId");
    const discountCode = formData.get("discountCode");

    if (!type || !referenceId) {
        return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch Item details
    let name = "";
    let price = 0;

    if (type === "block") {
        const block = await prisma.block.findUnique({ where: { id: referenceId } });
        if (!block || block.isFree) return Response.json({ error: "Invalid premium block" }, { status: 400 });
        name = `Unlock Block: ${block.name}`;
        price = block.basePrice;
    } else if (type === "bundle") {
        const bundle = await prisma.bundle.findUnique({ where: { id: referenceId } });
        if (!bundle) return Response.json({ error: "Invalid bundle" }, { status: 400 });
        name = `Bundle Upgrade: ${bundle.name}`;
        price = bundle.price;
    } else {
        return Response.json({ error: "Invalid type" }, { status: 400 });
    }

    // 2. Validate Discount (if any)
    let finalPrice = price;
    if (discountCode) {
        const discount = await prisma.discountCode.findUnique({ where: { code: discountCode } });
        if (discount && (!discount.expiryDate || discount.expiryDate > new Date())) {
            if (!discount.usageLimit || discount.usageLimit > discount.timesUsed) {
                if (discount.applicableTo === "ALL" || discount.applicableTo === type.toUpperCase()) {
                    if (!discount.referenceId || discount.referenceId === referenceId) {
                        finalPrice = discount.type === "PERCENTAGE"
                            ? price - (price * (discount.value / 100))
                            : Math.max(0, price - discount.value);

                        // Note: In real production, we atomically increment usage _after_ Shopify confirms billing
                    }
                }
            }
        }
    }

    // Ensure minimum price for Shopify API
    finalPrice = Math.max(finalPrice, 0.01);

    // 3. Create Shopify App Subscription via GraphQL
    const returnUrl = `${process.env.SHOPIFY_APP_URL}/app`;

    const response = await admin.graphql(
        `#graphql
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        userErrors {
          field
          message
        }
        appSubscription {
          id
        }
        confirmationUrl
      }
    }`,
        {
            variables: {
                name: name,
                returnUrl: returnUrl,
                test: true, // test mode for dev
                lineItems: [
                    {
                        plan: {
                            appRecurringPricingDetails: {
                                price: { amount: parseFloat(finalPrice.toFixed(2)), currencyCode: "USD" },
                                interval: "EVERY_30_DAYS"
                            }
                        }
                    }
                ]
            },
        }
    );

    const responseJson = await response.Response.json();
    const data = responseJson.data?.appSubscriptionCreate;

    if (data?.userErrors?.length > 0) {
        console.error("Billing Error", data.userErrors);
        return Response.json({ error: data.userErrors[0].message }, { status: 400 });
    }

    // 4. Save pending subscription to DB
    let shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shop) {
        shop = await prisma.shop.create({ data: { shopDomain: session.shop } });
    }

    await prisma.shopSubscription.create({
        data: {
            shopId: shop.id,
            subscriptionType: type.toUpperCase(),
            referenceId: referenceId,
            status: "PENDING",
            chargeId: data.appSubscription.id.match(/\d+$/)[0], // Extract numeric id from gid
        }
    });

    // Redirect merchant to Shopify approval page
    return redirect(data.confirmationUrl);
};
