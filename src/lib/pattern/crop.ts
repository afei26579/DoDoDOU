import type { CropTransform } from '../../features/workshop/model/types';

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

export async function cropImageToDataUrl(params: {
  imageUrl: string;
  cropTransform: CropTransform;
  outputSize?: number;
}): Promise<string> {
  const { imageUrl, cropTransform, outputSize = 1200 } = params;
  const image = await loadImage(imageUrl);

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize * dpr;
  canvas.height = outputSize * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建裁剪画布');
  }

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outputSize, outputSize);

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = cropTransform.scale || 1;

  // 与预览区 object-fit: contain 保持一致，先把原图缩放到裁剪框内
  const baseScale = Math.min(outputSize / imageWidth, outputSize / imageHeight);
  const displayWidth = imageWidth * baseScale * scale;
  const displayHeight = imageHeight * baseScale * scale;

  // cropTransform.x/y 对应的是预览中图片相对裁剪框中心的位移（CSS px）
  ctx.drawImage(
    image,
    (outputSize - displayWidth) / 2 + cropTransform.x,
    (outputSize - displayHeight) / 2 + cropTransform.y,
    displayWidth,
    displayHeight,
  );

  return canvas.toDataURL('image/png');
}
