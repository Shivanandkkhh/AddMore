import { authenticate } from "../shopify.server";
import db from "../db.server";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function shopDomainFromDest(dest) {
  try {
    return new URL(dest).host;
  } catch {
    return dest?.replace(/^https?:\/\//, "") ?? "";
  }
}

export const loader = async ({ request }) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shop = shopDomainFromDest(sessionToken.dest);

  const savedUpsells = await db.upsellProduct.findMany({
    where: { shop },
    orderBy: { position: "asc" },
  });

  return cors(
    jsonResponse({
      productIds: savedUpsells.map((item) => item.productId),
    }),
  );
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin") || "*";
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        Vary: "Origin",
      },
    });
  }

  return new Response(null, { status: 405 });
};
