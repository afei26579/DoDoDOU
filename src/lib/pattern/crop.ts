import type { CropTransform } from '../../features/workshop/model/types';

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

export function createCropCanvas(params: {
  image: HTMLImageElement;
  cropTransform: CropTransform;
  frameSize: number;
  outputSize?: number;
}) {
  const { image, cropTransform, frameSize, outputSize = frameSize } = params;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize * dpr;
  canvas.height = outputSize * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建裁剪画布');
  }

  const scale = cropTransform.scale || 1;
  const rotate = cropTransform.rotate ?? 0;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const baseScale = Math.min(outputSize / imageWidth, outputSize / imageHeight);
  const displayWidth = imageWidth * baseScale * scale;
  const displayHeight = imageHeight * baseScale * scale;
  const offsetX = (outputSize - displayWidth) / 2 + cropTransform.x;
  const offsetY = (outputSize - displayHeight) / 2 + cropTransform.y;

  ctx.scale(dpr, dpr);
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.translate(cropTransform.x, cropTransform.y);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -imageWidth * baseScale / 2, -imageHeight * baseScale / 2, imageWidth * baseScale, imageHeight * baseScale);

  // Keep explicit bounds in case future callers use the canvas as a visual preview.
  void offsetX;
  void offsetY;

  return canvas;
}

export async function cropImageToDataUrl(params: {
  imageUrl: string;
  cropTransform: CropTransform;
  outputSize?: number;
}): Promise<string> {
  const { imageUrl, cropTransform, outputSize = 1200 } = params;
  const image = await loadImage(imageUrl);
  const canvas = createCropCanvas({ image, cropTransform, frameSize: outputSize, outputSize });
  return canvas.toDataURL('image/png');
}
