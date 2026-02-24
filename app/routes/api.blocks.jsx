import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import fs from "fs";
import path from "path";

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
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

        // 4. Fetch the main theme ID using REST API directly (avoids GraphQL GID bridging issues)
        const themesListUrl = `https://${session.shop}/admin/api/2025-10/themes.json?role=main`;
        const themesListResponse = await fetch(themesListUrl, {
            headers: {
                'X-Shopify-Access-Token': session.accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (!themesListResponse.ok) {
            const themesErr = await themesListResponse.json().catch(() => ({}));
            throw new Error(`Could not fetch themes: ${JSON.stringify(themesErr)}`);
        }

        const themesListData = await themesListResponse.json();
        const mainTheme = themesListData.themes?.[0];

        if (!mainTheme) {
            throw new Error("Could not find the main theme to inject assets into.");
        }

        const themeId = mainTheme.id;
        const assetKey = `sections/addmore-${blockHandle}.liquid`;

        if (actionType === "activate") {
            // Read the template from local backend storage
            const filePath = path.join(process.cwd(), "app", "theme-assets", "blocks", `${blockHandle}.liquid`);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Template for ${blockHandle} not found on server.`);
            }
            const liquidContent = fs.readFileSync(filePath, "utf8");

            // Inject into theme using pure REST fetch
            try {
                const url = `https://${session.shop}/admin/api/2025-10/themes/${themeId}/assets.json`;
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': session.accessToken
                    },
                    body: JSON.stringify({
                        asset: {
                            key: assetKey,
                            value: liquidContent
                        }
                    })
                });
                if (!response.ok) {
                    const errBody = await response.json();
                    throw new Error(JSON.stringify(errBody));
                }
                console.log(`Injected ${assetKey} into theme ${themeId}`);
            } catch (err) {
                console.error("Asset upload error details:", err.message || err);
                throw new Error("Failed to upload asset via REST API: " + (err.message || String(err)));
            }
        } else if (actionType === "deactivate") {
            // Delete from theme using pure REST fetch
            try {
                const url = `https://${session.shop}/admin/api/2025-10/themes/${themeId}/assets.json?asset[key]=${assetKey}`;
                await fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'X-Shopify-Access-Token': session.accessToken
                    }
                });
                console.log(`Deleted ${assetKey} from theme ${themeId}`);
            } catch (err) {
                console.error("Asset delete error:", err.message || err);
                // Ignore 404s if it's already deleted
            }
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
