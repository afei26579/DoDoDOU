import type { CropTransform } from '../../features/workshop/model/types';

export function loadImage(src: string) {
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

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = cropTransform.scale || 1;
  const rotate = cropTransform.rotate ?? 0;
  const renderScale = outputSize / frameSize;
  const baseScale = Math.min(frameSize / imageWidth, frameSize / imageHeight);
  const drawWidth = imageWidth * baseScale * renderScale;
  const drawHeight = imageHeight * baseScale * renderScale;

  ctx.scale(dpr, dpr);
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.translate(cropTransform.x * renderScale, cropTransform.y * renderScale);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -drawWidth / (2 * scale), -drawHeight / (2 * scale), drawWidth / scale, drawHeight / scale);

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
