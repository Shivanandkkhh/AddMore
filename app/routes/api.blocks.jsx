import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();

    const actionType = formData.get("actionType");
    const blockHandle = formData.get("blockHandle");

    if (!blockHandle || !actionType) {
        return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
        // 1. Ensure the Shop exists in our DB
        let shop = await prisma.shop.findUnique({
            where: { shopDomain: session.shop },
            include: { activatedBlocks: true }
        });

        if (!shop) {
            shop = await prisma.shop.create({
                data: {
                    shopDomain: session.shop,
                },
                include: { activatedBlocks: true }
            });
        }

        // 2. Ensure Block exists in our DB
        let block = await prisma.block.findUnique({
            where: { handle: blockHandle }
        });

        if (!block) {
            // In a real app we'd sync this from a master list, but for now we'll auto-create
            block = await prisma.block.create({
                data: {
                    handle: blockHandle,
                    name: blockHandle,
                }
            });
        }

        // 3. Handle specific actions
        if (actionType === "activate") {
            // V2 Subscription Verification Logic
            if (!block.isFree) {
                const activeSubs = await prisma.shopSubscription.findMany({
                    where: { shopId: shop.id, status: "ACTIVE" },
                    select: { referenceId: true }
                });
                const activeRefIds = activeSubs.map(sub => sub.referenceId);
                let hasAccess = false;

                // 1. Direct block subscription check
                if (activeRefIds.includes(block.id)) {
                    hasAccess = true;
                }

                // 2. Bundle subscription check
                if (!hasAccess) {
                    const bundleLinks = await prisma.bundleBlock.findMany({
                        where: { blockId: block.id, bundleId: { in: activeRefIds } }
                    });
                    if (bundleLinks.length > 0) hasAccess = true;
                }

                if (!hasAccess) {
                    return Response.json({
                        error: "Premium Block Access Required. Subscribe to this block or a containing bundle.",
                        requiresPayment: true,
                        blockId: block.id
                    }, { status: 403 });
                }
            }

            // End Subscription Logic

            await prisma.shopActivatedBlock.upsert({
                where: {
                    shopId_blockId: {
                        shopId: shop.id,
                        blockId: block.id
                    }
                },
                update: {},
                create: {
                    shopId: shop.id,
                    blockId: block.id
                }
            });

        } else if (actionType === "deactivate") {
            await prisma.shopActivatedBlock.delete({
                where: {
                    shopId_blockId: {
                        shopId: shop.id,
                        blockId: block.id
                    }
                }
            }).catch(e => { /* Ignore if it doesn't exist */ });
        }

        // 4. Sync with Shopify App Metafields
        const updatedShop = await prisma.shop.findUnique({
            where: { shopDomain: session.shop },
            include: { activatedBlocks: { include: { block: true } } }
        });

        const activeBlockHandles = updatedShop.activatedBlocks.map(ab => ab.block.handle);

        // Get the shop's GID for metafield ownership
        const shopGidResponse = await admin.graphql(`#graphql
          query { shop { id } }
        `);
        const shopGidData = await shopGidResponse.json();
        const shopGid = shopGidData.data.shop.id;

        const metafieldsSetResponse = await admin.graphql(
            `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
            {
                variables: {
                    metafields: [
                        {
                            namespace: "marketplace",
                            key: "active_blocks",
                            type: "json",
                            value: JSON.stringify(activeBlockHandles),
                            ownerId: shopGid
                        },
                    ],
                },
            }
        );

        const metafieldData = await metafieldsSetResponse.json();
        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error("Metafield user errors:", metafieldData.data.metafieldsSet.userErrors);
        }

        return Response.json({ success: true, activeBlockHandles });

    } catch (error) {
        console.error("Failed to process block activation:", error);
        return Response.json({ error: "Failed to process block activation" }, { status: 500 });
    }
};
