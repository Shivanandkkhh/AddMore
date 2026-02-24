import prisma from "../db.server";

// Temporary endpoint to clear stale sessions for scope re-auth
// DELETE THIS FILE after scopes are properly granted
export const loader = async () => {
    try {
        const result = await prisma.session.deleteMany({});
        return Response.json({
            success: true,
            deletedCount: result.count,
            message: "All sessions cleared. Visit the app in Shopify Admin to re-authenticate with new scopes."
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
};
