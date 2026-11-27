/** A photo the owner picked, shrunk to something we can safely send to the AI (max ~600k characters as a data URL). */
const DEFAULT_CHARS = 590_000;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read. Try a JPEG or PNG photo.')); };
    img.src = url;
  });
}

/** Where the browser loads a stored photo from (uploads are served by the API through the same-origin proxy). */
export const mediaSrc = (url: string) => (url.startsWith('/media/') ? `/api${url}` : url);

export async function photoToDataUrl(file: File, o: { maxEdge?: number; maxChars?: number } = {}): Promise<string> {
  const MAX_CHARS = o.maxChars ?? DEFAULT_CHARS;
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('Please choose a photo (JPEG, PNG or WebP).');
  const img = await load(file);
  let scale = Math.min(1, (o.maxEdge ?? 1600) / Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that photo.');
    ctx.fillStyle = '#fff'; // PNGs with transparency would otherwise turn black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= MAX_CHARS) return url;
    }
    scale *= 0.75;
  }
  throw new Error('That photo is too large to read. Try a smaller or closer photo.');
}
