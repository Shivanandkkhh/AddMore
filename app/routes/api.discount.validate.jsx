import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
    await authenticate.admin(request);
    const formData = await request.formData();

    const code = formData.get("code");
    const type = formData.get("type"); // block/bundle
    const referenceId = formData.get("referenceId");

    if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

    const discount = await prisma.discountCode.findUnique({ where: { code } });

    if (!discount) return Response.json({ error: "Invalid discount code" });
    if (discount.expiryDate && discount.expiryDate < new Date()) return Response.json({ error: "Code expired" });
    if (discount.usageLimit && discount.timesUsed >= discount.usageLimit) return Response.json({ error: "Code usage limit reached" });

    if (discount.applicableTo !== "ALL" && discount.applicableTo !== type.toUpperCase()) {
        return Response.json({ error: `Code is not applicable to ${type}s` });
    }

    if (discount.referenceId && discount.referenceId !== referenceId) {
        return Response.json({ error: "Code is not valid for this specific item" });
    }

    return Response.json({
        success: true,
        discount: {
            type: discount.type,
            value: discount.value,
            code: discount.code
        }
    });
};
