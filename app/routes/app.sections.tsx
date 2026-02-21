import { useMemo } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import sectionsMetadata from "../data/sections.json";
import { buildThemeEditorAppBlockLink } from "../utils/theme-editor-link";

type SectionMetadata = {
  name: string;
  handle: string;
  description: string;
  previewImageUrl: string;
  category?: string;
  badge?: string;
};

export const loader = async ({ request }: { request: Request }) => {
  const { session } = await authenticate.admin(request);
  const runtime = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };

  const extensionId =
    runtime.process?.env?.SHOPIFY_THEME_EXTENSION_ID ||
    "65b30aae-2fc0-9b48-3e28-e6bf3e801b92f9c75ad7";

  return {
    extensionId,
    shop: session.shop,
    sections: (sectionsMetadata as SectionMetadata[]).filter(
      (section) => section.name && section.handle,
    ),
  };
};

export default function SectionsLibrary() {
  const { extensionId, sections, shop } = useLoaderData<typeof loader>();

  const sectionsWithLinks = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      addToThemeUrl: buildThemeEditorAppBlockLink({
        extensionId,
        blockHandle: section.handle,
        shop,
      }),
    }));
  }, [extensionId, sections, shop]);

  return (
    <s-page heading="Sections Library">
      <s-section heading="Theme App Blocks">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Add reusable app blocks to your theme from the Theme Editor.
          </s-paragraph>

          {sectionsWithLinks.length === 0 ? (
            <s-banner tone="warning">
              No sections are configured yet. Add entries in
              <code> app/data/sections.json </code>.
            </s-banner>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {sectionsWithLinks.map((section) => (
                <s-box
                  key={section.handle}
                  borderWidth="base"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack direction="block" gap="base">
                    <img
                      src={section.previewImageUrl}
                      alt={`${section.name} preview`}
                      style={{
                        width: "100%",
                        height: "168px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid #e1e3e5",
                      }}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />

                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text type="strong">{section.name}</s-text>
                      {section.badge ? <s-badge>{section.badge}</s-badge> : null}
                    </s-stack>

                    {section.category ? (
                      <s-text color="subdued">{section.category}</s-text>
                    ) : null}

                    <s-paragraph>{section.description}</s-paragraph>

                    <s-button
                      onClick={() => {
                        window.open(section.addToThemeUrl, "_top");
                      }}
                      disabled={!extensionId}
                    >
                      Add to theme
                    </s-button>
                  </s-stack>
                </s-box>
              ))}
            </div>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
