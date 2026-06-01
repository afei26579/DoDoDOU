export type ImageUploadPayload = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  width?: number;
  height?: number;
};

export function waitForLoadingPaint() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    window.setTimeout(finish, 80);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(finish);
    });
  });
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function getImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = dataUrl;
  });
}

export async function readUploadedImageFile(file: File): Promise<ImageUploadPayload & { width: number; height: number }> {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(dataUrl);

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl,
    ...dimensions,
  };
}
