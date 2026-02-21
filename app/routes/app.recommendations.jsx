import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Namespace + key that the checkout extension reads via Storefront API
const METAFIELD_NAMESPACE = "checkout_upsell";
const METAFIELD_KEY = "product_ids";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(
    `#graphql
    query getUpsellConfig {
      shop {
        id
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }`,
  );

  const data = await res.json();
  const shopId = data.data.shop.id;
  const savedValue = data.data.shop.metafield?.value;

  if (!savedValue) {
    return { products: [], shopId };
  }

  const productIds = JSON.parse(savedValue);
  if (productIds.length === 0) {
    return { products: [], shopId };
  }

  // Fetch product details for saved IDs
  const productsRes = await admin.graphql(
    `#graphql
    query getUpsellProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          featuredImage {
            url
            altText
          }
          variants(first: 1) {
            edges {
              node {
                price
                compareAtPrice
              }
            }
          }
        }
      }
    }`,
    { variables: { ids: productIds } },
  );
  const productsData = await productsRes.json();

  const productMap = {};
  for (const node of productsData.data.nodes) {
    if (node) productMap[node.id] = node;
  }

  const products = productIds.map((id) => productMap[id]).filter(Boolean);

  return { products, shopId };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productIds = JSON.parse(formData.get("productIds") || "[]");
  const shopId = formData.get("shopId");

  // Ensure the metafield definition exists with PUBLIC_READ storefront access
  // so the checkout extension can query it via Storefront API.
  // Errors are swallowed — if definition already exists (TAKEN) that's fine.
  await admin.graphql(
    `#graphql
    mutation ensureMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
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
        definition: {
          name: "Checkout Upsell Product IDs",
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: "json",
          ownerType: "SHOP",
          access: {
            admin: "MERCHANT_READ_WRITE",
            storefront: "PUBLIC_READ",
          },
        },
      },
    },
  );

  // Save the selected product IDs to the shop metafield
  const saveRes = await admin.graphql(
    `#graphql
    mutation saveUpsellProducts($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(productIds),
          },
        ],
      },
    },
  );

  const saveData = await saveRes.json();
  const errors = saveData.data?.metafieldsSet?.userErrors;
  if (errors?.length) {
    return { success: false, errors };
  }

  return { success: true };
};

function normalizeLoaderProduct(p) {
  return {
    id: p.id,
    title: p.title,
    imageUrl: p.featuredImage?.url ?? null,
    imageAlt: p.featuredImage?.altText ?? p.title,
    price: p.variants?.edges?.[0]?.node?.price ?? null,
  };
}

function normalizePickerProduct(p) {
  return {
    id: p.id,
    title: p.title,
    imageUrl: p.images?.[0]?.originalSrc ?? null,
    imageAlt: p.title,
    price: p.variants?.[0]?.price ?? null,
  };
}

export default function Recommendations() {
  const { products: savedProducts, shopId } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [selectedProducts, setSelectedProducts] = useState(
    savedProducts.map(normalizeLoaderProduct),
  );
  const [isDirty, setIsDirty] = useState(false);

  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    setSelectedProducts(savedProducts.map(normalizeLoaderProduct));
    setIsDirty(false);
  }, [savedProducts]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Recommendations saved");
      setIsDirty(false);
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show("Failed to save. Please try again.", {
        isError: true,
      });
    }
  }, [fetcher.data, shopify]);

  const handleOpenPicker = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: selectedProducts.map((p) => ({ id: p.id })),
    });

    if (selected) {
      const normalized = selected.map(normalizePickerProduct);
      const selectedIds = new Set(normalized.map((p) => p.id));
      const kept = selectedProducts.filter((p) => selectedIds.has(p.id));
      const keptIds = new Set(kept.map((p) => p.id));
      const added = normalized.filter((p) => !keptIds.has(p.id));
      setSelectedProducts([...kept, ...added]);
      setIsDirty(true);
    }
  };

  const handleRemove = (productId) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
    setIsDirty(true);
  };

  const handleSave = () => {
    fetcher.submit(
      {
        productIds: JSON.stringify(selectedProducts.map((p) => p.id)),
        shopId,
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Checkout Recommendations">
      <s-button
        slot="primary-action"
        onClick={handleSave}
        {...(isDirty && !isSaving ? {} : { disabled: true })}
        {...(isSaving ? { loading: true } : {})}
      >
        Save
      </s-button>

      <s-section heading="Selected Products">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Choose products to display as upsell recommendations on your
            checkout page. Changes take effect after saving.
          </s-paragraph>

          <s-button onClick={handleOpenPicker}>Browse products</s-button>

          {selectedProducts.length === 0 ? (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-paragraph>
                No products selected. Click &quot;Browse products&quot; to add
                recommendations.
              </s-paragraph>
            </s-box>
          ) : (
            <s-stack direction="block" gap="tight">
              {selectedProducts.map((product, index) => (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        color: "#6d7175",
                        fontSize: "13px",
                        minWidth: "20px",
                        textAlign: "center",
                      }}
                    >
                      {index + 1}
                    </span>

                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.imageAlt}
                        style={{
                          width: "56px",
                          height: "56px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          border: "1px solid #e1e3e5",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "6px",
                          border: "1px solid #e1e3e5",
                          background: "#f6f6f7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: "20px",
                        }}
                      >
                        📦
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "#202223",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {product.title}
                      </div>
                      {product.price && (
                        <div style={{ fontSize: "13px", color: "#6d7175" }}>
                          ${product.price}
                        </div>
                      )}
                    </div>

                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => handleRemove(product.id)}
                    >
                      Remove
                    </s-button>
                  </div>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          Products selected here will appear as upsell recommendations on your
          Shopify checkout page via the checkout extension.
        </s-paragraph>
        <s-paragraph>
          The order shown here is the order customers will see them at checkout.
        </s-paragraph>
        <s-paragraph>
          <s-text variant="bodyMd" fontWeight="semibold">Tip: </s-text>
          Out-of-stock products are automatically hidden at checkout.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
