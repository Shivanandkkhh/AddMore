import { useState, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useFetcher, useLoaderData } from "react-router";
import { Page, Layout, Card, Text, Button, BlockStack, InlineStack, Badge, Modal, TextField, Banner } from "@shopify/polaris";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Quick Seeder for Sandbox Prototype
  const blockCount = await prisma.block.count().catch(() => 0);
  if (blockCount === 0) {
    try {
      const b1 = await prisma.block.create({ data: { handle: "hero-01", name: "Hero Section", isFree: true, basePrice: 0 } });
      const b2 = await prisma.block.create({ data: { handle: "testimonials-01", name: "Testimonials Section", isFree: true, basePrice: 0 } });
      const b3 = await prisma.block.create({ data: { handle: "reels-01", name: "UGC Reels", isFree: true, basePrice: 0 } });
      const b4 = await prisma.block.create({ data: { handle: "before-after-01", name: "Before & After", isFree: false, basePrice: 7.0 } });
      const b5 = await prisma.block.create({ data: { handle: "featured-collection", name: "Featured Collection", isFree: true, basePrice: 0 } });

      const bun1 = await prisma.bundle.create({ data: { name: "Conversion Pack", price: 19.0, billingInterval: "MONTHLY" } });
      await prisma.bundleBlock.createMany({
        data: [
          { bundleId: bun1.id, blockId: b3.id },
          { bundleId: bun1.id, blockId: b4.id },
          { bundleId: bun1.id, blockId: b5.id },
        ]
      });
    } catch (e) { } // Ignore seed failures
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: {
      activatedBlocks: { include: { block: true } },
      subscriptions: true
    }
  });

  const activeHandles = shop?.activatedBlocks.map(ab => ab.block.handle) || [];
  const activeSubs = shop?.subscriptions.filter(s => s.status === "ACTIVE").map(s => s.referenceId) || [];

  const blocks = await prisma.block.findMany({ orderBy: { name: 'asc' } });
  const bundles = await prisma.bundle.findMany({ include: { blocks: { include: { block: true } } } });

  return { activeHandles, activeSubs, blocks, bundles };
};

export default function Index() {
  const { activeHandles, activeSubs, blocks, bundles } = useLoaderData();
  const [activatedBlocks, setActivatedBlocks] = useState({});
  const [checkoutModal, setCheckoutModal] = useState({ open: false, type: "", referenceId: "", price: 0, name: "" });
  const [discountCode, setDiscountCode] = useState("");

  const discountFetcher = useFetcher();
  const activationFetcher = useFetcher();

  useEffect(() => {
    const initial = {};
    activeHandles.forEach(handle => initial[handle] = true);
    setActivatedBlocks(initial);
  }, [activeHandles]);

  const handleActivate = (block) => {
    if (!block.isFree && !activeSubs.includes(block.id)) {
      // Check if they own a bundle housing this block
      const ownsBundleForBlock = bundles.some(bun => activeSubs.includes(bun.id) && bun.blocks.some(bb => bb.block.handle === block.handle));
      if (!ownsBundleForBlock) {
        setCheckoutModal({ open: true, type: "block", referenceId: block.id, price: block.basePrice, name: block.name });
        return;
      }
    }

    setActivatedBlocks((prev) => ({ ...prev, [block.handle]: true }));
    activationFetcher.submit(
      { actionType: "activate", blockHandle: block.handle },
      { method: "post", action: "/api/blocks" }
    );
  };

  const handleDeactivate = (block) => {
    setActivatedBlocks((prev) => ({ ...prev, [block.handle]: false }));
    activationFetcher.submit(
      { actionType: "deactivate", blockHandle: block.handle },
      { method: "post", action: "/api/blocks" }
    );
  };

  const subscribeFetcher = useFetcher();
  const handleSubscribeForm = () => {
    subscribeFetcher.submit(
      { type: checkoutModal.type, referenceId: checkoutModal.referenceId, discountCode },
      { method: "post", action: "/api/subscribe" }
    );
  };

  const applyDiscount = () => {
    discountFetcher.submit(
      { code: discountCode, type: checkoutModal.type, referenceId: checkoutModal.referenceId },
      { method: "post", action: "/api/discount/validate" }
    );
  };

  return (
    <Page title="Advanced Block Marketplace">
      <Layout>
        <Layout.Section>
          {activationFetcher.data?.error && (
            <Banner status="critical">{activationFetcher.data.error}</Banner>
          )}

          <BlockStack gap="400">
            <Text variant="headingXl" as="h2">Individual Theme Blocks</Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {blocks.map((block) => (
                <Card key={block.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h3">{block.name}</Text>
                      {block.isFree ? <Badge tone="success">Free</Badge> : <Badge tone="attention">${block.basePrice}/mo</Badge>}
                    </InlineStack>
                    <Text color="subdued">Enhance your Shopify theme instantly.</Text>
                    <Button
                      onClick={() => activatedBlocks[block.handle] ? handleDeactivate(block) : handleActivate(block)}
                      variant={activatedBlocks[block.handle] ? "secondary" : (block.isFree || activeSubs.includes(block.id) ? "primary" : "secondary")}
                      tone={activatedBlocks[block.handle] ? "critical" : undefined}
                    >
                      {activatedBlocks[block.handle] ? "Deactivate" : (block.isFree ? "Activate" : "Buy & Activate")}
                    </Button>
                  </BlockStack>
                </Card>
              ))}
            </div>

            <Text variant="headingXl" as="h2">Value Bundles (Save 20%+)</Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
              {bundles.map((bundle) => (
                <Card key={bundle.id} background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text variant="headingLg" as="h3">{bundle.name}</Text>
                      <Badge tone="info" size="large">${bundle.price}/{bundle.billingInterval.toLowerCase()}</Badge>
                    </InlineStack>
                    <div style={{ paddingLeft: '20px' }}>
                      <ul style={{ margin: 0 }}>
                        {bundle.blocks.map(bb => <li key={bb.id}><Text>{bb.block.name}</Text></li>)}
                      </ul>
                    </div>
                    <Button
                      onClick={() => setCheckoutModal({ open: true, type: "bundle", referenceId: bundle.id, price: bundle.price, name: bundle.name })}
                      disabled={activeSubs.includes(bundle.id)}
                      variant="primary"
                    >
                      {activeSubs.includes(bundle.id) ? "Subscribed to Bundle" : "Subscribe to Pack"}
                    </Button>
                  </BlockStack>
                </Card>
              ))}
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={checkoutModal.open}
        onClose={() => setCheckoutModal({ ...checkoutModal, open: false })}
        title={`Subscribe: ${checkoutModal.name}`}
        primaryAction={{ content: 'Confirm Payment', onAction: handleSubscribeForm, loading: subscribeFetcher.state !== "idle" }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setCheckoutModal({ ...checkoutModal, open: false }) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text>You will be redirected to Shopify's secure billing portal to approve this monthly recurring charge.</Text>
            <Card>
              <InlineStack align="space-between">
                <Text variant="headingMd">Base Price:</Text>
                <Text variant="headingMd">${checkoutModal.price.toFixed(2)}/mo</Text>
              </InlineStack>
              {discountFetcher.data?.discount && (
                <InlineStack align="space-between">
                  <Text tone="success">Discount ({discountFetcher.data.discount.code}):</Text>
                  <Text tone="success">
                    -{discountFetcher.data.discount.type === "PERCENTAGE" ? `${discountFetcher.data.discount.value}%` : `$${discountFetcher.data.discount.value}`}
                  </Text>
                </InlineStack>
              )}
            </Card>

            <InlineStack gap="300" align="start">
              <div style={{ flexGrow: 1 }}>
                <TextField label="Discount Code" value={discountCode} onChange={setDiscountCode} autoComplete="off" />
              </div>
              <div style={{ marginTop: '24px' }}>
                <Button onClick={applyDiscount}>Apply</Button>
              </div>
            </InlineStack>
            {discountFetcher.data?.error && <Text tone="critical">{discountFetcher.data.error}</Text>}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
