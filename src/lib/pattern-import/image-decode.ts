export type DecodedPatternImage = {
  fileName: string;
  dataUrl: string;
  imageData: ImageData;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scale: number;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = dataUrl;
  });
}

export function isPatternImportImageFile(file: File) {
  const extension = file.name.trim().toLowerCase().split('.').pop() ?? '';
  return file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
}

export async function decodePatternImportImageFile(file: File, options: { maxSide?: number } = {}): Promise<DecodedPatternImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  if (!originalWidth || !originalHeight) {
    throw new Error('图片尺寸无效');
  }

  const maxSide = Math.max(320, options.maxSide ?? 2400);
  const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器无法创建图片解码画布');

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, width, height);

  return {
    fileName: file.name,
    dataUrl,
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
    originalWidth,
    originalHeight,
    scale,
  };
}
