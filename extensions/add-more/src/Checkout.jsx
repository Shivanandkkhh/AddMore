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
  const [addingVariantId, setAddingVariantId] = useState(null);
  const [showError, setShowError] = useState(false);
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState({});
  const { lines } = shopify;
  const canAddCartLine = shopify.instructions.value.lines.canAddCartLine;

  useEffect(() => {
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
                variants(first: 25) {
                  nodes {
                    id
                    title
                    availableForSale
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }`,
          {
            variables: { first: 30 },
          }
        );

        const normalized = data["products"].nodes
          .map((product) => {
            const availableVariants = (product.variants?.nodes ?? []).filter(
              (variant) => variant.availableForSale
            );
            return { ...product, availableVariants };
          })
          .filter((product) => product.availableVariants.length > 0);

        setProducts(normalized);
      } catch (error) {
        console.error(error);
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
    if (!canAddCartLine) return;
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

  useEffect(() => {
    setSelectedVariantByProduct((prev) => {
      const next = { ...prev };
      for (const product of products) {
        if (!next[product.id] && product.availableVariants?.[0]?.id) {
          next[product.id] = product.availableVariants[0].id;
        }
      }
      return next;
    });
  }, [products]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  const productsOnOffer = getProductsOnOffer(lines.value, products);
  const displayedProducts = productsOnOffer.slice(0, 5);

  if (!displayedProducts.length) {
    return null;
  }

  return (
    <s-stack gap="large-200">
      <s-divider />
      <s-heading>You might also like</s-heading>

      <s-stack gap="base">
        {displayedProducts.map((product) => {
          const imageUrl =
            product.images?.nodes?.[0]?.url ??
            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

          const selectedVariantId =
            selectedVariantByProduct[product.id] ??
            product.availableVariants[0].id;
          const selectedVariant =
            product.availableVariants.find(
              (variant) => variant.id === selectedVariantId
            ) ?? product.availableVariants[0];
          const renderPrice = i18n.formatCurrency(selectedVariant.price.amount);

          return (
            <s-grid
              key={product.id}
              gap="base"
              gridTemplateColumns="64px 1fr auto"
              alignItems="center"
            >
              <s-image
                borderWidth="base"
                borderRadius="large-100"
                src={imageUrl}
                alt={product.title}
                aspectRatio="1"
              />

              <s-stack gap="tight">
                <s-text type="strong">{product.title}</s-text>
                <s-text color="subdued">{renderPrice}</s-text>

                {product.availableVariants.length > 1 ? (
                  <s-select
                    label="Variant"
                    value={selectedVariant.id}
                    onChange={(event) =>
                      setSelectedVariantByProduct((prev) => ({
                        ...prev,
                        [product.id]: event.currentTarget.value,
                      }))
                    }
                  >
                    {product.availableVariants.map((variant) => (
                      <s-option key={variant.id} value={variant.id}>
                        {variant.title}
                      </s-option>
                    ))}
                  </s-select>
                ) : null}
              </s-stack>

              <s-button
                variant="secondary"
                loading={addingVariantId === selectedVariant.id}
                disabled={!canAddCartLine}
                accessibilityLabel={`Add ${product.title} to cart`}
                onClick={() => handleAddToCart(selectedVariant.id)}
              >
                Add
              </s-button>
            </s-grid>
          );
        })}
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
  const cartLineProductVariantIds = new Set(
    lines.map((item) => item.merchandise.id)
  );

  return products
    .map((product) => {
      const availableVariantsNotInCart = product.availableVariants.filter(
        ({ id }) => !cartLineProductVariantIds.has(id)
      );

      return {
        ...product,
        availableVariants: availableVariantsNotInCart,
      };
    })
    .filter((product) => product.availableVariants.length > 0);
}

function ErrorBanner() {
  return (
    <s-banner tone="critical">
      There was an issue adding this product. Please try again.
    </s-banner>
  );
}
