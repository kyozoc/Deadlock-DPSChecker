// deadlock-api の画像 URL の作り方は deadlock-api/deadlock-api の
// api/src/services/assets/versions/heroes.rs (extract_image_url) と items/paths.rs に合わせている
export const DEADLOCK_API_IMAGES = 'https://assets-bucket.deadlock-api.com/assets-api-res/images';

export const ITEM_ANCHORS = ['abilities/', 'upgrades/', 'hud/'];
export const HERO_ANCHORS = [...ITEM_ANCHORS, 'heroes/'];

/** vdata の画像パス (file://{images}/heroes/haze_card.psd など) → deadlock-api の画像 URL */
export function deadlockApiUrl(vdataPath: string | undefined, anchors: string[]): string | undefined {
  if (!vdataPath || /\.v?svg"?$/.test(vdataPath)) return undefined;
  const index = anchors.map((a) => vdataPath.indexOf(a)).find((i) => i >= 0);
  const rel = index !== undefined ? vdataPath.slice(index) : vdataPath.split('{images}/')[1];
  if (!rel) return undefined;
  const cleaned = rel
    .replace(/"/g, '')
    .replace('_psd.vtex', '.png')
    .replace('_png.vtex', '.png')
    .replace('_psd.', '.')
    .replace('_png.', '.')
    .replace('.psd', '.png');
  return `${DEADLOCK_API_IMAGES}/${cleaned}`;
}
