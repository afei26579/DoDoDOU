import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createLoginRedirectPath } from '../../features/auth/model/redirect';
import { useCapability } from '../../features/subscription/model/EntitlementProvider';
import type { ColorSystem, PatternResult } from '../../features/workshop/model/types';
import { waitForLoadingPaint } from '../../lib/imageFile';
import { DEFAULT_DOWNLOAD_AUTHOR_NAME, downloadPatternImage, type DownloadPatternOptions } from '../../lib/pattern/download';
import { LoadingOverlay } from '../../shared/ui/LoadingOverlay';

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

const LOGIN_REQUIRED_MESSAGE = '登录后可下载图纸';

export function DownloadSettingsModal({ open, onClose, brand, patternResult, defaultPatternName = '' }: DownloadSettingsModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const canDownload = useCapability('export.download');
  const canExportHd = useCapability('export.hd');
  const canRemoveWatermark = useCapability('export.no_watermark');
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
  }, [defaultPatternName, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDownloading) onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDownloading, open, onClose]);

  useEffect(() => {
    if (!canExportHd && highDefinition) setHighDefinition(false);
    if (!canRemoveWatermark && !addWatermark) setAddWatermark(true);
  }, [addWatermark, canExportHd, canRemoveWatermark, highDefinition]);

  const handleWatermarkToggle = () => {
    if (!addWatermark) {
      setAddWatermark(true);
      setEntitlementMessage('');
      return;
    }

    if (!canRemoveWatermark) {
      setEntitlementMessage('当前方案暂不支持去除水印');
      return;
    }

    setAddWatermark(false);
    setEntitlementMessage('');
  };

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
    if (!canDownload) {
      setEntitlementMessage(LOGIN_REQUIRED_MESSAGE);
      return;
    }

    setIsDownloading(true);
    try {
      await waitForLoadingPaint();
      const downloadOptions: DownloadPatternOptions = {
        authorName: DEFAULT_DOWNLOAD_AUTHOR_NAME,
        patternName,
        showGrid,
        gridGap,
        gridColor,
        showSymbol,
        showSymbolStats,
        addWatermark: canRemoveWatermark ? addWatermark : true,
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

  const showLoginAction = !canDownload && entitlementMessage === LOGIN_REQUIRED_MESSAGE;

  return (
    <div
      className="download-modal__backdrop"
      role="presentation"
      onClick={() => {
        if (!isDownloading) onClose();
      }}
    >
      <section
        className="download-modal"
        role="dialog"
        aria-modal="true"
        aria-label="下载设置"
        aria-busy={isDownloading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="download-modal__handle" aria-hidden="true" />

        <header className="download-modal__header">
          <h3>下载设置</h3>
          <button type="button" className="download-modal__close" aria-label="关闭" onClick={onClose} disabled={isDownloading}>
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
                onClick={handleWatermarkToggle}
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
            {entitlementMessage ? (
              <div className="download-modal__permission-row">
                <p className="download-modal__help">{entitlementMessage}</p>
                {showLoginAction ? (
                  <button
                    type="button"
                    className="download-modal__login-action"
                    onClick={() => navigate(createLoginRedirectPath(location))}
                  >
                    去登录
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <button type="button" className="download-modal__action" onClick={handleDownload} disabled={!patternResult || isDownloading}>
          {isDownloading ? '生成中...' : '下载图纸'}
        </button>
        <LoadingOverlay
          open={isDownloading}
          scope="modal"
          title="正在生成图纸"
          message="正在整理格子、色号和物料清单..."
        />
      </section>
    </div>
  );
}
