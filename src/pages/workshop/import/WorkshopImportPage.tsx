import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { beadBrandKeys, getBeadBrandLabel } from '../../../lib/pattern/brand';
import { drawPatternPreview } from '../../../lib/pattern/preview';
import { reconstructPatternFromImageGrid } from '../../../lib/pattern-import/cell-read';
import { createPatternImportProjectMeta } from '../../../lib/pattern-import/diagnostics';
import type { DecodedPatternImage } from '../../../lib/pattern-import/image-decode';
import { parsePatternImportFile } from '../../../lib/pattern-import/structured';
import { PatternImportError, type PatternImportResult } from '../../../lib/pattern-import/types';
import { reconstructPatternResult } from '../../../lib/pattern-import/reconstruct';
import { validatePatternResult } from '../../../lib/pattern-import/validate';
import { defaultCropTransform, defaultWorkshopConfig } from '../../../features/workshop/model/defaults';
import { createWorkshopProject } from '../../../features/workshop/model/projectStore';
import type { ColorSystem, PatternCell, PatternResult } from '../../../features/workshop/model/types';
import { LoadingOverlay } from '../../../shared/ui/LoadingOverlay';
import styles from './WorkshopImportPage.module.css';

const DATA_IMPORT_FILE_ACCEPT = '.json,.md,.markdown,.csv,.tsv,.txt';

function createProjectId() {
  return `import-${Date.now()}`;
}

function getTitleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || '导入图纸';
}

type ImageGridSettings = {
  columns: number;
  rows: number;
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  calibrationSize: 3 | 6;
  calibrationCol: number;
  calibrationRow: number;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function createInitialImageGrid(image: DecodedPatternImage): ImageGridSettings {
  const cellSize = Math.max(4, Math.round(Math.min(image.width, image.height) / 48));
  const columns = Math.max(1, Math.floor(image.width / cellSize));
  const rows = Math.max(1, Math.floor(image.height / cellSize));
  return {
    columns,
    rows,
    originX: 0,
    originY: 0,
    cellWidth: cellSize,
    cellHeight: cellSize,
    calibrationSize: 6,
    calibrationCol: Math.max(0, Math.floor(columns / 2) - 3),
    calibrationRow: Math.max(0, Math.floor(rows / 2) - 3),
  };
}

function normalizeImageGrid(grid: ImageGridSettings, image: DecodedPatternImage): ImageGridSettings {
  const columns = Math.max(1, Math.round(grid.columns));
  const rows = Math.max(1, Math.round(grid.rows));
  const cellWidth = clampNumber(Math.round(grid.cellWidth), 1, Math.max(image.width, 1));
  const cellHeight = clampNumber(Math.round(grid.cellHeight), 1, Math.max(image.height, 1));
  const calibrationSize = grid.calibrationSize === 3 ? 3 : 6;
  return {
    ...grid,
    columns,
    rows,
    originX: Math.round(clampNumber(grid.originX, -image.width, image.width)),
    originY: Math.round(clampNumber(grid.originY, -image.height, image.height)),
    cellWidth,
    cellHeight,
    calibrationSize,
    calibrationCol: Math.round(clampNumber(grid.calibrationCol, 0, Math.max(0, columns - calibrationSize))),
    calibrationRow: Math.round(clampNumber(grid.calibrationRow, 0, Math.max(0, rows - calibrationSize))),
  };
}

function getPatternCellKey(x: number, y: number) {
  return `${x},${y}`;
}

function PatternPreviewCanvas({
  patternResult,
  lowConfidenceCellKeys = [],
  onCellClick,
}: {
  patternResult: PatternResult;
  lowConfidenceCellKeys?: string[];
  onCellClick?: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const longestSide = Math.max(patternResult.width, patternResult.height, 1);
    const cellSize = Math.max(3, Math.min(18, Math.floor(520 / longestSide)));
    canvas.width = Math.max(1, patternResult.width * cellSize);
    canvas.height = Math.max(1, patternResult.height * cellSize);
    drawPatternPreview({ canvas, pattern: patternResult });

    if (lowConfidenceCellKeys.length > 0) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const lowConfidenceSet = new Set(lowConfidenceCellKeys);
      const cellWidth = canvas.width / patternResult.width;
      const cellHeight = canvas.height / patternResult.height;
      ctx.save();
      ctx.fillStyle = 'rgba(235, 72, 72, 0.16)';
      ctx.strokeStyle = 'rgba(235, 72, 72, 0.95)';
      ctx.lineWidth = Math.max(1.5, Math.min(cellWidth, cellHeight) * 0.12);
      for (const key of lowConfidenceSet) {
        const [xText, yText] = key.split(',');
        const x = Number(xText);
        const y = Number(yText);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        ctx.strokeRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      }
      ctx.restore();
    }
  }, [lowConfidenceCellKeys, patternResult]);

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * patternResult.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * patternResult.height);
    if (x < 0 || y < 0 || x >= patternResult.width || y >= patternResult.height) return;
    onCellClick(x, y);
  };

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.previewCanvas} ${onCellClick ? styles.previewCanvasEditable : ''}`}
      aria-label="导入图纸预览"
      onClick={handleClick}
    />
  );
}

function ImageAlignmentCanvas({ image, grid }: { image: DecodedPatternImage; grid: ImageGridSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(image.imageData, 0, 0);

    ctx.save();
    ctx.lineWidth = Math.max(1, image.width / 900);
    ctx.strokeStyle = 'rgba(235, 72, 72, 0.82)';
    for (let col = 0; col <= grid.columns; col += 1) {
      const x = grid.originX + col * grid.cellWidth;
      if (x < 0 || x > image.width) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, image.height);
      ctx.stroke();
    }
    for (let row = 0; row <= grid.rows; row += 1) {
      const y = grid.originY + row * grid.cellHeight;
      if (y < 0 || y > image.height) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(image.width, y);
      ctx.stroke();
    }

    const calibrationCols = Math.min(grid.calibrationSize, grid.columns);
    const calibrationRows = Math.min(grid.calibrationSize, grid.rows);
    const startX = grid.originX + grid.calibrationCol * grid.cellWidth;
    const startY = grid.originY + grid.calibrationRow * grid.cellHeight;
    const width = calibrationCols * grid.cellWidth;
    const height = calibrationRows * grid.cellHeight;
    ctx.fillStyle = 'rgba(40, 180, 98, 0.1)';
    ctx.fillRect(startX, startY, width, height);
    ctx.strokeStyle = 'rgba(23, 151, 83, 0.96)';
    ctx.lineWidth = Math.max(2, image.width / 420);
    for (let col = 0; col <= calibrationCols; col += 1) {
      const x = startX + col * grid.cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + height);
      ctx.stroke();
    }
    for (let row = 0; row <= calibrationRows; row += 1) {
      const y = startY + row * grid.cellHeight;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + width, y);
      ctx.stroke();
    }
    ctx.restore();
  }, [grid, image]);

  return <canvas ref={canvasRef} className={styles.alignmentCanvas} aria-label="图片网格对齐预览" />;
}

function createLowConfidenceIssues(cells: PatternImportResult['analysis']['cells']) {
  return cells
    .filter((cell) => cell.confidence < 0.54)
    .slice(0, 20)
    .map((cell) => ({
      severity: 'warning' as const,
      code: 'lowConfidenceCell' as const,
      message: `格子 (${cell.x + 1}, ${cell.y + 1}) 采样置信度较低`,
      path: `cells.${cell.y}.${cell.x}`,
    }));
}

function rebuildEditedPatternImportResult(
  current: PatternImportResult,
  nextCells: PatternCell[],
  editedCellKeys: Set<string>,
): PatternImportResult {
  const patternResult = reconstructPatternResult({
    width: current.patternResult.width,
    height: current.patternResult.height,
    cells: nextCells,
  });
  const previousCells = new Map(current.analysis.cells.map((cell) => [getPatternCellKey(cell.x, cell.y), cell]));
  const analysisCells = patternResult.cells.map((cell) => {
    const key = getPatternCellKey(cell.x, cell.y);
    const previous = previousCells.get(key);
    const edited = editedCellKeys.has(key);
    return {
      x: cell.x,
      y: cell.y,
      sampledHex: previous?.sampledHex ?? (cell.hex === 'transparent' ? undefined : cell.hex),
      rawCodeText: cell.vendorCode || undefined,
      importColorKey: cell.colorId,
      resolvedHex: cell.hex === 'transparent' ? undefined : cell.hex,
      resolvedCode: cell.vendorCode || undefined,
      isExternal: cell.isExternal,
      confidence: edited ? 1 : previous?.confidence ?? 1,
      evidence: previous?.evidence ?? [{ type: 'sampled-color' as const, value: cell.hex }],
    };
  });
  const lowConfidenceIssues = createLowConfidenceIssues(analysisCells);
  const baseValidation = validatePatternResult(patternResult);
  const validation = {
    ...baseValidation,
    lowConfidenceCellCount: analysisCells.filter((cell) => cell.confidence < 0.54).length,
    issues: [...baseValidation.issues, ...lowConfidenceIssues],
  };

  return {
    ...current,
    patternResult,
    validation,
    analysis: {
      ...current.analysis,
      palette: patternResult.palette.map((entry) => ({
        importColorKey: entry.colorId,
        rawCode: entry.vendorCode,
        rawCount: entry.count,
        swatchHex: entry.hex,
        resolvedCode: entry.vendorCode,
        resolvedHex: entry.hex,
        resolution: 'external',
        confidence: 1,
        issues: [],
      })),
      cells: analysisCells,
      issues: validation.issues,
    },
  };
}

function getErrorMessages(error: unknown) {
  if (error instanceof PatternImportError) {
    return error.issues.map((issue) => issue.message);
  }
  if (error instanceof Error) return [error.message];
  return ['导入失败，请检查文件内容'];
}

export function WorkshopImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [brand, setBrand] = useState<ColorSystem>(defaultWorkshopConfig.brand);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parseResult, setParseResult] = useState<PatternImportResult | null>(null);
  const [decodedImage, setDecodedImage] = useState<DecodedPatternImage | null>(null);
  const [imageGrid, setImageGrid] = useState<ImageGridSettings | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeColorId, setActiveColorId] = useState('');
  const [mergeSourceColorId, setMergeSourceColorId] = useState('');
  const [mergeTargetColorId, setMergeTargetColorId] = useState('');

  const blockingIssues = useMemo(
    () => parseResult?.validation.issues.filter((issue) => issue.severity === 'error') ?? [],
    [parseResult],
  );
  const warningIssues = useMemo(
    () => parseResult?.validation.issues.filter((issue) => issue.severity !== 'error') ?? [],
    [parseResult],
  );
  const paletteEntries = useMemo(() => parseResult?.patternResult.palette ?? [], [parseResult]);
  const activePaletteEntry = paletteEntries.find((entry) => entry.colorId === activeColorId) ?? paletteEntries[0] ?? null;
  const lowConfidenceCellKeys = useMemo(
    () => parseResult?.analysis.cells
      .filter((cell) => cell.confidence < 0.54)
      .map((cell) => getPatternCellKey(cell.x, cell.y)) ?? [],
    [parseResult],
  );

  useEffect(() => {
    const firstColorId = paletteEntries[0]?.colorId ?? '';
    const secondColorId = paletteEntries[1]?.colorId ?? firstColorId;
    setActiveColorId((current) => paletteEntries.some((entry) => entry.colorId === current) ? current : firstColorId);
    setMergeSourceColorId((current) => paletteEntries.some((entry) => entry.colorId === current) ? current : firstColorId);
    setMergeTargetColorId((current) => paletteEntries.some((entry) => entry.colorId === current) ? current : secondColorId);
  }, [paletteEntries]);

  const handleParseFile = async (file: File) => {
    setSelectedFileName(file.name);
    setParseResult(null);
    setDecodedImage(null);
    setImageGrid(null);
    setErrorMessages([]);
    setIsParsing(true);

    try {
      const result = await parsePatternImportFile(file, { brand });
      if (result.config) setBrand(result.config.brand);
      setParseResult(result);
    } catch (error) {
      setErrorMessages(getErrorMessages(error));
    } finally {
      setIsParsing(false);
    }
  };

  const updateImageGrid = (patch: Partial<ImageGridSettings>) => {
    setImageGrid((current) => {
      if (!current || !decodedImage) return current;
      return normalizeImageGrid({ ...current, ...patch }, decodedImage);
    });
  };

  const handleMoveCalibration = (deltaCol: number, deltaRow: number) => {
    if (!imageGrid) return;
    updateImageGrid({
      calibrationCol: imageGrid.calibrationCol + deltaCol,
      calibrationRow: imageGrid.calibrationRow + deltaRow,
    });
  };

  const handleAnalyzeImageGrid = () => {
    if (!decodedImage || !imageGrid) return;
    setErrorMessages([]);
    const grid = normalizeImageGrid(imageGrid, decodedImage);
    const result = reconstructPatternFromImageGrid({
      imageData: decodedImage.imageData,
      fileName: decodedImage.fileName,
      columns: grid.columns,
      rows: grid.rows,
      originX: grid.originX,
      originY: grid.originY,
      cellWidth: grid.cellWidth,
      cellHeight: grid.cellHeight,
    });

    setImageGrid(grid);
    setParseResult({
      ...result,
      config: {
        ...defaultWorkshopConfig,
        brand,
        canvasSize: Math.max(grid.columns, grid.rows),
      },
    });
  };

  const handlePaintCell = (x: number, y: number) => {
    if (!parseResult || !activePaletteEntry) return;
    const editedKey = getPatternCellKey(x, y);
    const nextCells = parseResult.patternResult.cells.map((cell) => {
      if (cell.x !== x || cell.y !== y) return cell;
      return {
        x: cell.x,
        y: cell.y,
        colorId: activePaletteEntry.colorId,
        vendorCode: activePaletteEntry.vendorCode,
        hex: activePaletteEntry.hex,
      };
    });
    setParseResult(rebuildEditedPatternImportResult(parseResult, nextCells, new Set([editedKey])));
  };

  const handlePaintLowConfidenceCells = () => {
    if (!parseResult || !activePaletteEntry || lowConfidenceCellKeys.length === 0) return;
    const editedKeys = new Set(lowConfidenceCellKeys);
    const nextCells = parseResult.patternResult.cells.map((cell) => {
      if (!editedKeys.has(getPatternCellKey(cell.x, cell.y))) return cell;
      return {
        x: cell.x,
        y: cell.y,
        colorId: activePaletteEntry.colorId,
        vendorCode: activePaletteEntry.vendorCode,
        hex: activePaletteEntry.hex,
      };
    });
    setParseResult(rebuildEditedPatternImportResult(parseResult, nextCells, editedKeys));
  };

  const handleMergeColors = () => {
    if (!parseResult || mergeSourceColorId === mergeTargetColorId) return;
    const target = paletteEntries.find((entry) => entry.colorId === mergeTargetColorId);
    if (!target) return;
    const editedKeys = new Set<string>();
    const nextCells = parseResult.patternResult.cells.map((cell) => {
      if (cell.colorId !== mergeSourceColorId) return cell;
      editedKeys.add(getPatternCellKey(cell.x, cell.y));
      return {
        x: cell.x,
        y: cell.y,
        colorId: target.colorId,
        vendorCode: target.vendorCode,
        hex: target.hex,
      };
    });
    if (editedKeys.size === 0) return;
    setParseResult(rebuildEditedPatternImportResult(parseResult, nextCells, editedKeys));
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await handleParseFile(file);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleParseFile(file);
  };

  const handleSaveProject = async () => {
    if (!parseResult || blockingIssues.length > 0) return;

    setIsSaving(true);
    try {
      const projectId = createProjectId();
      const importMeta = createPatternImportProjectMeta({
        sourceType: parseResult.analysis.document.sourceType,
        fileName: parseResult.analysis.document.fileName,
        analysis: parseResult.analysis,
        validation: parseResult.validation,
      });

      await createWorkshopProject(projectId, {
        title: getTitleFromFileName(parseResult.analysis.document.fileName),
        kind: 'pattern',
        status: 'ready',
        beadingState: 'idle',
        sourceType: 'import',
        sourceItemId: null,
        uploadedImage: null,
        cropTransform: defaultCropTransform,
        config: {
          ...defaultWorkshopConfig,
          brand,
          ...parseResult.config,
        },
        patternResult: parseResult.patternResult,
        viewMode: 'pattern',
        editorState: null,
        progress: null,
        beadingProgress: null,
        importMeta,
        lastOpenedAt: new Date().toISOString(),
      });

      navigate(`/workshop/result/${projectId}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <LoadingOverlay
        open={isParsing || isSaving}
        title={isSaving ? '正在保存项目' : '正在解析数据'}
        message={isSaving ? '正在创建图纸项目...' : '正在读取文件并校验图纸结构...'}
      />

      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/workshop')} aria-label="返回工作台">
          ‹
        </button>
        <div>
          <p className={styles.eyebrow}>Data Import</p>
          <h1>数据导入</h1>
        </div>
      </header>

      <section className={styles.layout}>
        <div className={styles.leftPane}>
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept={DATA_IMPORT_FILE_ACCEPT}
              onChange={handleFileInputChange}
            />
            <div className={styles.dropIcon} aria-hidden="true">↓</div>
            <div className={styles.dropCopy}>
              <strong>{selectedFileName || '选择 JSON / MD / CSV / TSV 数据文件'}</strong>
              <span>Markdown 表格与 CSV/TSV 矩阵会按色号或颜色 token 导入。</span>
            </div>
            <button type="button" className={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
              选择数据文件
            </button>
          </div>

          <label className={styles.brandSelect}>
            <span>文本数据默认色卡</span>
            <select value={brand} onChange={(event) => setBrand(event.target.value as ColorSystem)}>
              {beadBrandKeys.map((brandKey) => (
                <option key={brandKey} value={brandKey}>{getBeadBrandLabel(brandKey)}</option>
              ))}
            </select>
          </label>

          {errorMessages.length > 0 ? (
            <section className={styles.messagePanel} aria-label="导入错误">
              <h2>导入失败</h2>
              {errorMessages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </section>
          ) : null}
        </div>

        <aside className={styles.rightPane} aria-label="数据导入结果">
          {decodedImage && imageGrid && !parseResult ? (
            <section className={styles.alignPanel} aria-label="图片网格对齐">
              <div className={styles.alignHeader}>
                <div>
                  <h2>九宫格对齐</h2>
                  <p>{decodedImage.width} × {decodedImage.height}px，红线为最终分割网格。</p>
                </div>
                <div className={styles.alignMode} role="group" aria-label="绿色校准网格数量">
                  {[3, 6].map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={imageGrid.calibrationSize === size ? styles.alignModeActive : ''}
                      onClick={() => updateImageGrid({ calibrationSize: size as 3 | 6 })}
                    >
                      {size}×{size}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.alignCanvasWrap}>
                <ImageAlignmentCanvas image={decodedImage} grid={imageGrid} />
              </div>

              <div className={styles.alignControls}>
                <label>
                  <span>列数</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={imageGrid.columns}
                    onChange={(event) => updateImageGrid({ columns: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>行数</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={imageGrid.rows}
                    onChange={(event) => updateImageGrid({ rows: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>原点 X</span>
                  <input
                    type="number"
                    value={imageGrid.originX}
                    onChange={(event) => updateImageGrid({ originX: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>原点 Y</span>
                  <input
                    type="number"
                    value={imageGrid.originY}
                    onChange={(event) => updateImageGrid({ originY: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>格宽</span>
                  <input
                    type="number"
                    min={1}
                    value={imageGrid.cellWidth}
                    onChange={(event) => updateImageGrid({ cellWidth: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>格高</span>
                  <input
                    type="number"
                    min={1}
                    value={imageGrid.cellHeight}
                    onChange={(event) => updateImageGrid({ cellHeight: Number(event.target.value) })}
                  />
                </label>
              </div>

              <div className={styles.alignNudgeGrid} aria-label="校准区位置">
                <button type="button" onClick={() => handleMoveCalibration(0, -1)}>↑</button>
                <button type="button" onClick={() => handleMoveCalibration(-1, 0)}>←</button>
                <button type="button" onClick={() => handleMoveCalibration(1, 0)}>→</button>
                <button type="button" onClick={() => handleMoveCalibration(0, 1)}>↓</button>
              </div>

              <button type="button" className={styles.saveButton} onClick={handleAnalyzeImageGrid}>
                下一步识别色块
              </button>
            </section>
          ) : parseResult ? (
            <>
              {decodedImage && imageGrid ? (
                <button type="button" className={styles.secondaryButton} onClick={() => setParseResult(null)}>
                  返回网格对齐
                </button>
              ) : null}
              <div className={styles.previewCard}>
                <PatternPreviewCanvas
                  patternResult={parseResult.patternResult}
                  lowConfidenceCellKeys={lowConfidenceCellKeys}
                  onCellClick={paletteEntries.length > 0 ? handlePaintCell : undefined}
                />
              </div>

              <div className={styles.summaryGrid}>
                <div>
                  <span>尺寸</span>
                  <strong>{parseResult.patternResult.width} × {parseResult.patternResult.height}</strong>
                </div>
                <div>
                  <span>豆数</span>
                  <strong>{parseResult.validation.totalCells.toLocaleString()}</strong>
                </div>
                <div>
                  <span>颜色</span>
                  <strong>{parseResult.validation.colorCount}</strong>
                </div>
                <div>
                  <span>空格</span>
                  <strong>{parseResult.validation.emptyCellCount.toLocaleString()}</strong>
                </div>
              </div>

              {paletteEntries.length > 0 ? (
                <section className={styles.correctionPanel} aria-label="整理色号">
                  <div className={styles.correctionHeader}>
                    <div>
                      <h2>整理色号</h2>
                      <span>低置信度 {lowConfidenceCellKeys.length}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!activePaletteEntry || lowConfidenceCellKeys.length === 0}
                      onClick={handlePaintLowConfidenceCells}
                    >
                      应用到低置信度
                    </button>
                  </div>

                  <div className={styles.paletteStrip} role="list" aria-label="临时色号">
                    {paletteEntries.map((entry) => (
                      <button
                        key={entry.colorId}
                        type="button"
                        className={activeColorId === entry.colorId ? styles.paletteChipActive : ''}
                        aria-pressed={activeColorId === entry.colorId}
                        onClick={() => setActiveColorId(entry.colorId)}
                      >
                        <span style={{ backgroundColor: entry.hex }} />
                        <strong>{entry.vendorCode}</strong>
                        <em>{entry.count}</em>
                      </button>
                    ))}
                  </div>

                  <div className={styles.mergeRow}>
                    <label>
                      <span>源色</span>
                      <select value={mergeSourceColorId} onChange={(event) => setMergeSourceColorId(event.target.value)}>
                        {paletteEntries.map((entry) => (
                          <option key={entry.colorId} value={entry.colorId}>{entry.vendorCode} · {entry.count}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>目标色</span>
                      <select value={mergeTargetColorId} onChange={(event) => setMergeTargetColorId(event.target.value)}>
                        {paletteEntries.map((entry) => (
                          <option key={entry.colorId} value={entry.colorId}>{entry.vendorCode} · {entry.count}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" disabled={mergeSourceColorId === mergeTargetColorId} onClick={handleMergeColors}>
                      合并
                    </button>
                  </div>
                </section>
              ) : null}

              {warningIssues.length > 0 ? (
                <section className={styles.messagePanel} aria-label="导入提示">
                  <h2>提示</h2>
                  {warningIssues.slice(0, 5).map((issue, index) => (
                    <p key={`${issue.code}-${index}`}>{issue.message}</p>
                  ))}
                </section>
              ) : null}

              <button
                type="button"
                className={styles.saveButton}
                disabled={blockingIssues.length > 0 || isSaving}
                onClick={handleSaveProject}
              >
                保存为项目
              </button>
            </>
          ) : (
            <div className={styles.emptyPreview}>
              <span aria-hidden="true">▦</span>
              <strong>等待数据导入</strong>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
