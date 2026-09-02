import { storage } from "../storage/BrowserWorkspaceStore";
import type { Project } from "../domain/model";
/** Owns temporary asset addresses for exactly one mounted preview. */
export class FrameTrailAdapter {
  private urls: string[] = [];
  async resolveAssetUrls(project: Project) {
    const assets: Record<string, string> = {};
    try {
      for (const m of project.media) {
        if (m.source.kind === "asset" && !assets[m.source.assetId]) {
          const url = URL.createObjectURL(
            await storage.getAsset(m.source.assetId),
          );
          this.urls.push(url);
          assets[m.source.assetId] = url;
        }
      }
      return assets;
    } catch (e) {
      this.revokeResolvedAssetUrls();
      throw e;
    }
  }
  revokeResolvedAssetUrls() {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls = [];
  }
}
