import { useEffect, useState } from 'react';
import { useCapability } from '../../features/subscription/model/EntitlementProvider';
import type { ColorSystem, PatternResult } from '../../features/workshop/model/types';
import { DEFAULT_DOWNLOAD_AUTHOR_NAME, downloadPatternImage, type DownloadPatternOptions } from '../../lib/pattern/download';

type DownloadSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  brand: ColorSystem;
  patternResult: PatternResult | null;
  defaultPatternName?: string;
};

const colorOptions = [
  { label: '黑色', value: '#2D2A2F' },
  { label: '玫红', value: '#F46D7A' },
  { label: '蓝色', value: '#5FA5F7' },
  { label: '绿色', value: '#39C8A3' },
  { label: '紫色', value: '#B081F7' },
  { label: '黄色', value: '#FDBA28' },
] as const;

export function DownloadSettingsModal({ open, onClose, brand, patternResult, defaultPatternName = '' }: DownloadSettingsModalProps) {
  const canExportHd = useCapability('export.hd');
  const [patternName, setPatternName] = useState(defaultPatternName);
  const [showGrid, setShowGrid] = useState(true);
  const [gridGap, setGridGap] = useState(10);
  const [gridColor, setGridColor] = useState<(typeof colorOptions)[number]['value']>(colorOptions[0].value);
  const [showSymbol, setShowSymbol] = useState(true);
  const [showSymbolStats, setShowSymbolStats] = useState(true);
  const [addWatermark, setAddWatermark] = useState(true);
  const [highDefinition, setHighDefinition] = useState(false);
  const [entitlementMessage, setEntitlementMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setPatternName(defaultPatternName);
    setHighDefinition(false);
    setEntitlementMessage('');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [defaultPatternName, open, onClose]);

  useEffect(() => {
    if (!canExportHd && highDefinition) setHighDefinition(false);
  }, [canExportHd, highDefinition]);

  const handleHighDefinitionToggle = () => {
    if (highDefinition) {
      setHighDefinition(false);
      setEntitlementMessage('');
      return;
    }

    if (!canExportHd) {
      setEntitlementMessage('当前方案暂不支持高清导出');
      return;
    }

    setHighDefinition(true);
    setEntitlementMessage('');
  };

  const handleDownload = async () => {
    if (!patternResult || isDownloading) return;
    setIsDownloading(true);
    try {
      const downloadOptions: DownloadPatternOptions = {
        authorName: DEFAULT_DOWNLOAD_AUTHOR_NAME,
        patternName,
        showGrid,
        gridGap,
        gridColor,
        showSymbol,
        showSymbolStats,
        addWatermark,
        highDefinition: canExportHd && highDefinition,
        brand,
        patternResult,
      };
      await downloadPatternImage(downloadOptions);
      onClose();
    } finally {
      setIsDownloading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="download-modal__backdrop" role="presentation" onClick={onClose}>
      <section
        className="download-modal"
        role="dialog"
        aria-modal="true"
        aria-label="下载设置"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="download-modal__handle" aria-hidden="true" />

        <header className="download-modal__header">
          <h3>下载设置</h3>
          <button type="button" className="download-modal__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="download-modal__body">
          <div className="download-modal__form-row">
            <label className="download-modal__field">
              <span>图纸名称</span>
              <input
                className="download-modal__input"
                value={patternName}
                placeholder="输入图纸名称"
                onChange={(event) => setPatternName(event.target.value)}
              />
            </label>
          </div>

          <section className="download-modal__card">
            <div className="download-modal__setting-row">
              <div className="download-modal__setting-title">
                <span className="download-modal__setting-icon">▦</span>
                <strong>显示网格分割线</strong>
              </div>
              <button
                type="button"
                className={`download-switch ${showGrid ? 'is-on' : ''}`}
                role="switch"
                aria-checked={showGrid}
                aria-label="显示网格分割线"
                onClick={() => setShowGrid((current) => !current)}
              />
            </div>
          </section>

          <section className="download-modal__card download-modal__card--stacked">
            <div className="download-modal__setting-row download-modal__setting-row--slider">
              <div className="download-modal__setting-title">
                <span className="download-modal__setting-icon">▥</span>
                <strong>分割线间隔</strong>
              </div>
              <span className="download-modal__value-chip">{gridGap}</span>
            </div>

            <input
              className="download-modal__range"
              type="range"
              min={4}
              max={24}
              step={1}
              value={gridGap}
              onChange={(event) => setGridGap(Number(event.target.value))}
            />
          </section>

          <section className="download-modal__card download-modal__card--stacked">
            <div className="download-modal__setting-row download-modal__setting-row--tight">
              <div className="download-modal__setting-title">
                <span className="download-modal__setting-icon">◔</span>
                <strong>分割线颜色</strong>
              </div>
            </div>

            <div className="download-modal__color-row" role="list" aria-label="颜色选择">
              {colorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`download-modal__color ${gridColor === option.value ? 'is-active' : ''}`}
                  style={{ backgroundColor: option.value }}
                  aria-label={option.label}
                  aria-pressed={gridColor === option.value}
                  onClick={() => setGridColor(option.value)}
                />
              ))}
            </div>
          </section>

          <section className="download-modal__card download-modal__card--list">
            <div className="download-modal__setting-row download-modal__setting-row--list">
              <strong>显示色号</strong>
              <button
                type="button"
                className={`download-switch ${showSymbol ? 'is-on' : ''}`}
                role="switch"
                aria-checked={showSymbol}
                aria-label="显示色号"
                onClick={() => setShowSymbol((current) => !current)}
              />
            </div>
            <div className="download-modal__divider" />
            <div className="download-modal__setting-row download-modal__setting-row--list">
              <strong>用料清单</strong>
              <button
                type="button"
                className={`download-switch ${showSymbolStats ? 'is-on' : ''}`}
                role="switch"
                aria-checked={showSymbolStats}
                aria-label="用料清单"
                onClick={() => setShowSymbolStats((current) => !current)}
              />
            </div>
            <div className="download-modal__divider" />
            <div className="download-modal__setting-row download-modal__setting-row--list">
              <strong>添加水印</strong>
              <button
                type="button"
                className={`download-switch ${addWatermark ? 'is-on' : ''}`}
                role="switch"
                aria-checked={addWatermark}
                aria-label="添加水印"
                onClick={() => setAddWatermark((current) => !current)}
              />
            </div>
            <div className="download-modal__divider" />
            <div className="download-modal__setting-row download-modal__setting-row--list">
              <div className="download-modal__setting-title">
                <span className="download-modal__setting-icon">⤢</span>
                <strong>高清导出</strong>
              </div>
              <button
                type="button"
                className={`download-switch ${highDefinition ? 'is-on' : ''}`}
                role="switch"
                aria-checked={highDefinition}
                aria-label="高清导出"
                onClick={handleHighDefinitionToggle}
              />
            </div>
            {entitlementMessage ? <p className="download-modal__help">{entitlementMessage}</p> : null}
            
          </section>
        </div>

        <button type="button" className="download-modal__action" onClick={handleDownload} disabled={!patternResult || isDownloading}>
          {isDownloading ? '生成中...' : '下载图纸'}
        </button>
      </section>
    </div>
  );
}
