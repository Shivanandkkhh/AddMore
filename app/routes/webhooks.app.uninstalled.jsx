import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Update SaaS Shop model to mark as uninstalled
  await db.shop.update({
    where: { shopDomain: shop },
    data: { uninstalledAt: new Date() }
  }).catch(() => {
    // Catch if shop doesn't exist yet
    console.log(`Could not update uninstall timestamp for ${shop}, record not found.`);
  });

  return new Response();
};
