import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const [activatedBlocks, setActivatedBlocks] = useState({});

  const handleActivate = (id) => {
    setActivatedBlocks((prev) => ({ ...prev, [id]: true }));
  };

  const blocks = [
    {
      id: 1,
      title: "Hero Section",
      description: "A high-converting hero banner with a customizable background and call-to-action button.",
      image: "https://cdn.shopify.com/b/shopify-brochure2-assets/225c04e21a224a1b0235c5c962b8fc5f.png",
    },
    {
      id: 2,
      title: "Testimonials Section",
      description: "Build trust with a 3-column customer review block featuring names, text, and 5-star ratings.",
      image: "https://cdn.shopify.com/b/shopify-brochure2-assets/d89cf21e35dd713c71a3962635ba4da3.png",
    },
    {
      id: 3,
      title: "UGC Reels Section",
      description: "A 9:16 mobile-first video player for User Generated Content. Features autoplay and mute toggles.",
      image: "https://cdn.shopify.com/b/shopify-brochure2-assets/8ebc70bb3f56d953d6abdb1762c4eaeb.png",
    },
    {
      id: 4,
      title: "Hover Feature Cards",
      description: "Side-by-side expandable feature cards with customizable gradients and interactive hover animations.",
      image: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
    },
    {
      id: 5,
      title: "Lookbook Section",
      description: "Interactive image lookbook with shoppable hotspots that display product information on hover.",
      image: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_large.png",
    },
    {
      id: 6,
      title: "FAQ Section",
      description: "An accordion-style FAQ section to answer common customer questions and improve conversion.",
      image: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_large.png",
    },
    {
      id: 7,
      title: "Before & After Section",
      description: "An interactive slider to compare two images side-by-side, perfect for showcasing results.",
      image: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-6_large.png",
    },
  ];

  return (
    <s-page heading="Theme Block Marketplace">
      <div style={{ padding: "0 20px" }}>
        {Object.keys(activatedBlocks).length > 0 ? (
          <div style={{ padding: '15px', backgroundColor: '#e3f1df', color: '#1a5525', borderRadius: '8px', marginBottom: '20px' }}>
            <p style={{ margin: 0 }}>
              <strong>Blocks Activated Successfully!</strong> The highlighted blocks are now available in your theme. Go to <strong>Online Store → Themes → Customize → Add Block → Apps</strong> to preview and place them on your storefront.
            </p>
          </div>
        ) : (
          <div style={{ padding: '15px', backgroundColor: '#e4f0fa', color: '#084e8a', borderRadius: '8px', marginBottom: '20px' }}>
            <p style={{ margin: 0 }}>
              Click "Activate" on any block to instantly enable premium sections for your storefront.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Available Blocks</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {blocks.map((block) => (
            <s-box key={block.id} padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <img
                src={block.image}
                alt={block.title}
                style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' }}
              />
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>{block.title}</h3>
              <p style={{ margin: 0, color: '#666', lineHeight: '1.4' }}>{block.description}</p>
              <div style={{ marginTop: '15px' }}>
                <s-button
                  onClick={() => handleActivate(block.id)}
                  disabled={activatedBlocks[block.id]}
                >
                  {activatedBlocks[block.id] ? "Activated" : "Activate"}
                </s-button>
              </div>
            </s-box>
          ))}
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
