import type { PatternPaletteColor } from './color-system';
import { generatePatternCore } from './generate-core';
import type { WorkshopConfig } from '../../features/workshop/model/types';

type GeneratePatternWorkerRequest = {
  id: number;
  imageData: ImageData;
  canvasSize: number;
  palette: PatternPaletteColor[];
  config: WorkshopConfig;
};

type GeneratePatternWorkerResponse =
  | {
      id: number;
      ok: true;
      pattern: ReturnType<typeof generatePatternCore>['pattern'];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

self.onmessage = (event: MessageEvent<GeneratePatternWorkerRequest>) => {
  const { id, imageData, canvasSize, palette, config } = event.data;

  try {
    const result = generatePatternCore({
      imageData,
      canvasSize,
      palette,
      config,
    });

    self.postMessage({
      id,
      ok: true,
      pattern: result.pattern,
    } satisfies GeneratePatternWorkerResponse);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : '图纸生成失败',
    } satisfies GeneratePatternWorkerResponse);
  }
};
