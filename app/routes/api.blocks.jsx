import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

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
            }).catch(() => { /* Ignore if it doesn't exist */ });
        }

        // 4. Fetch the main theme ID via GraphQL.
        //    This also forces a token refresh (via admin client) if the offline token
        //    has rotated under `expiringOfflineAccessTokens: true`, writing the fresh
        //    token back to the Prisma session storage before we use it below.
        const themesResponse = await admin.graphql(`#graphql
          query {
            themes(first: 1, roles: [MAIN]) {
              edges {
                node { id }
              }
            }
          }
        `);
        const themesData = await themesResponse.json();
        const themeGid = themesData.data?.themes?.edges?.[0]?.node?.id;

        if (!themeGid) {
            throw new Error("Could not find the main theme to inject assets into.");
        }

        // Extract the numeric theme ID from the GID (gid://shopify/OnlineStoreTheme/123456)
        const themeId = themeGid.split('/').pop();

        // Re-read the offline session from Prisma — the graphql() call above may have
        // refreshed an expired token and written the new one to storage.
        const freshSession = await prisma.session.findFirst({
            where: { shop: session.shop, isOnline: false },
            orderBy: { expires: 'desc' }
        });
        const accessToken = freshSession?.accessToken;
        if (!accessToken) {
            throw new Error("No valid offline access token found. Please re-install the app.");
        }

        const assetKey = `sections/addmore-${blockHandle}.liquid`;

        if (actionType === "activate") {
            // Read the Liquid template from the server filesystem
            const filePath = path.join(process.cwd(), "app", "theme-assets", "blocks", `${blockHandle}.liquid`);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Template for ${blockHandle} not found on server.`);
            }
            const liquidContent = fs.readFileSync(filePath, "utf8");

            // Upload to the theme via REST Asset API using the fresh offline token
            const uploadUrl = `https://${session.shop}/admin/api/2025-10/themes/${themeId}/assets.json`;
            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({ asset: { key: assetKey, value: liquidContent } })
            });
            if (!uploadRes.ok) {
                const errBody = await uploadRes.json().catch(() => ({}));
                throw new Error(`Failed to upload theme asset: ${JSON.stringify(errBody)}`);
            }
            console.log(`Injected ${assetKey} into theme ${themeId}`);

        } else if (actionType === "deactivate") {
            // Delete the asset from the theme — ignore 404 if it was never uploaded
            const deleteUrl = `https://${session.shop}/admin/api/2025-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
            await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': accessToken }
            }).catch(() => {});
            console.log(`Deleted ${assetKey} from theme ${themeId}`);
        }

        const updatedShopFinal = await prisma.shop.findUnique({
            where: { shopDomain: session.shop },
            include: { activatedBlocks: { include: { block: true } } }
        });
        const activeBlockHandles = updatedShopFinal.activatedBlocks.map(ab => ab.block.handle);

        return Response.json({ success: true, activeBlockHandles });

    } catch (error) {
        console.error("Failed to process block activation:", error);

        // Check if this is a scope/permission error
        if (error?.response?.status === 401 || error?.response?.status === 403 ||
            (error instanceof Response && (error.status === 401 || error.status === 403))) {
            return Response.json({
                error: "Permission denied. Please refresh the app page to re-authenticate with updated permissions, then try again.",
                requiresReauth: true
            }, { status: 403 });
        }

        return Response.json({ error: "Failed to process block activation: " + (error?.message || String(error)) }, { status: 500 });
    }
};
