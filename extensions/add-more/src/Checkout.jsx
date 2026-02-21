import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

// 1. Export the extension
export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const { applyCartLinesChange, query, i18n } = shopify;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showError, setShowError] = useState(false);
  const { lines } = shopify;

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  async function handleAddToCart(variantId) {
    setAdding(true);
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setAdding(false);
    if (result.type === "error") {
      setShowError(true);
      console.error(result.message);
    }
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const { data } = await query(
        `query ($first: Int!) {
          products(first: $first) {
            nodes {
              id
              title
              images(first:1){
                nodes {
                  url
                }
              }
              variants(first: 1) {
                nodes {
                  id
                  price {
                    amount
                  }
                }
              }
            }
          }
        }`,
        {
          variables: { first: 5 },
        }
      );
      setProducts(data["products"].nodes);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  const productsOnOffer = getProductsOnOffer(lines.value, products);

  if (!productsOnOffer.length) {
    return null;
  }

  return (
    <ProductOffer
      product={productsOnOffer[0]}
      i18n={i18n}
      adding={adding}
      handleAddToCart={handleAddToCart}
      showError={showError}
    />
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
      cartLineProductVariantIds.includes(id)
    );
    return !isProductVariantInCart;
  });
}

function ProductOffer({ product, i18n, adding, handleAddToCart, showError }) {
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
            loading={adding}
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

function ErrorBanner() {
  return (
    <s-banner tone="critical">
      There was an issue adding this product. Please try again.
    </s-banner>
  );
}
