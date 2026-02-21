import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const METAFIELD_NAMESPACE = "checkout_upsell";
const METAFIELD_KEY = "product_ids";

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const { applyCartLinesChange, instructions, i18n, lines, query } = shopify;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingVariantId, setAddingVariantId] = useState(null);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const configResult = await query(
          `query UpsellConfig($namespace: String!, $key: String!) {
            shop {
              metafield(namespace: $namespace, key: $key) {
                value
              }
            }
          }`,
          {
            variables: {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
            },
          },
        );

        const rawValue = configResult?.data?.shop?.metafield?.value;
        if (!rawValue) {
          setProducts([]);
          return;
        }

        let productIds = [];
        try {
          productIds = JSON.parse(rawValue);
        } catch {
          productIds = [];
        }

        if (!Array.isArray(productIds) || productIds.length === 0) {
          setProducts([]);
          return;
        }

        const productsResult = await query(
          `query UpsellProducts($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                id
                title
                images(first: 1) {
                  nodes {
                    url
                  }
                }
                variants(first: 1) {
                  nodes {
                    id
                    availableForSale
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }`,
          { variables: { ids: productIds } },
        );

        const productById = new Map();
        const nodes = productsResult?.data?.nodes ?? [];

        for (const node of nodes) {
          if (!node) continue;
          if (!node.variants?.nodes?.length) continue;
          productById.set(node.id, node);
        }

        const orderedProducts = productIds
          .map((id) => productById.get(id))
          .filter(Boolean);

        setProducts(orderedProducts);
      } catch (error) {
        console.error(error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [query]);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  async function handleAddToCart(variantId) {
    if (!instructions.value.lines.canAddCartLine) return;
    setAddingVariantId(variantId);
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setAddingVariantId(null);
    if (result.type === "error") {
      setShowError(true);
      console.error(result.message);
    }
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  const productsOnOffer = getProductsOnOffer(lines.value, products);

  if (!productsOnOffer.length) {
    return null;
  }

  const product = productsOnOffer[0];
  const { images, title, variants } = product;
  const renderPrice = i18n.formatCurrency(variants.nodes[0].price.amount);
  const imageUrl =
    images.nodes[0]?.url ??
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

  return (
    <s-stack gap="large-200">
      <s-divider />
      <s-heading>You might also like</s-heading>
      <s-stack gap="base">
        <s-grid
          gap="base"
          gridTemplateColumns="64px 1fr auto"
          alignItems="center"
        >
          <s-image
            borderWidth="base"
            borderRadius="large-100"
            src={imageUrl}
            alt={title}
            aspectRatio="1"
          />
          <s-stack gap="none">
            <s-text type="strong">{title}</s-text>
            <s-text color="subdued">{renderPrice}</s-text>
          </s-stack>
          <s-button
            variant="secondary"
            loading={Boolean(addingVariantId)}
            disabled={!instructions.value.lines.canAddCartLine}
            accessibilityLabel={`Add ${title} to cart`}
            onClick={() => handleAddToCart(variants.nodes[0].id)}
          >
            Add
          </s-button>
        </s-grid>
      </s-stack>
      {showError && <ErrorBanner />}
    </s-stack>
  );
}

function LoadingSkeleton() {
  return (
    <s-stack gap="large-200">
      <s-divider />
      <s-heading>You might also like</s-heading>
      <s-stack gap="base">
        <s-grid
          gap="base"
          gridTemplateColumns="64px 1fr auto"
          alignItems="center"
        >
          <s-image loading="lazy" />
          <s-stack gap="none">
            <s-skeleton-paragraph />
            <s-skeleton-paragraph />
          </s-stack>
          <s-button variant="secondary" disabled={true}>
            Add
          </s-button>
        </s-grid>
      </s-stack>
    </s-stack>
  );
}

function getProductsOnOffer(lines, products) {
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id);
  return products.filter((product) => {
    const isProductVariantInCart = product.variants.nodes.some(({ id }) =>
      cartLineProductVariantIds.includes(id),
    );
    const isAvailable = product.variants.nodes.some(
      ({ availableForSale }) => availableForSale,
    );
    return !isProductVariantInCart && isAvailable;
  });
}

function ErrorBanner() {
  return (
    <s-banner tone="critical">
      There was an issue adding this product. Please try again.
    </s-banner>
  );
}
