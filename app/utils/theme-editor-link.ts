export type ThemeEditorAppBlockLinkInput = {
  extensionId: string;
  blockHandle: string;
  shop?: string;
};

export function buildThemeEditorAppBlockLink({
  extensionId,
  blockHandle,
  shop,
}: ThemeEditorAppBlockLinkInput): string {
  const params = new URLSearchParams({
    context: "apps",
    activateAppId: `${extensionId}/${blockHandle}`,
  });

  const path = `/admin/themes/current/editor?${params.toString()}`;

  if (!shop) return path;

  return `https://${shop}${path}`;
}
