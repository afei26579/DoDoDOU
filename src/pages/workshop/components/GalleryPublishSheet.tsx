import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../features/auth/model/AuthProvider';
import { useCapability } from '../../../features/subscription/model/EntitlementProvider';
import type { PatternResult, WorkshopConfig, UploadedImage } from '../../../features/workshop/model/types';
import { publishGalleryItem } from '../../../features/gallery/model/api';
import { generatePatternCover } from '../../../lib/pattern/cover';
import { drawPatternPreview } from '../../../lib/pattern/preview';

const OFFICIAL_DEFAULT_TAGS = '官方, 免费, 拼豆';

export type GalleryPublishSheetProps = {
  open: boolean;
  titleSeed?: string;
  uploadedImage: UploadedImage | null;
  patternResult: PatternResult | null;
  config: WorkshopConfig;
  projectId: string | null;
  onClose: () => void;
  onPublished?: (itemId: string) => void;
};

function splitTags(input: string) {
  return input
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOfficialTags(input: string) {
  const tags = splitTags(input);
  const merged = ['官方', '免费', ...tags];
  return Array.from(new Set(merged)).slice(0, 10);
}

function buildPreviewDataUrl(patternResult: PatternResult) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(240, patternResult.width * 24);
  canvas.height = Math.max(240, patternResult.height * 24);
  drawPatternPreview({
    canvas,
    pattern: patternResult,
  });
  return canvas.toDataURL('image/png');
}

export function GalleryPublishSheet({
  open,
  titleSeed,
  uploadedImage,
  patternResult,
  config,
  projectId,
  onClose,
  onPublished,
}: GalleryPublishSheetProps) {
  const navigate = useNavigate();
  const { status: authStatus, isAuthenticated, user } = useAuth();
  const canPublish = useCapability('gallery.publish');
  const [title, setTitle] = useState(titleSeed ?? '');
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState(OFFICIAL_DEFAULT_TAGS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [publishedItemId, setPublishedItemId] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(title.trim() && patternResult && isAuthenticated && canPublish && !successMessage), [canPublish, isAuthenticated, patternResult, successMessage, title]);

  useEffect(() => {
    if (!open || !patternResult) return;
    const dataUrl = buildPreviewDataUrl(patternResult);
    setCoverUrl(dataUrl);
    setPreviewUrl(dataUrl);
  }, [open, patternResult]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccessMessage(null);
    setPublishedItemId(null);
  }, [open]);

  if (!open) return null;

  const loginRedirect = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  const handleLogin = () => {
    navigate(loginRedirect);
  };

  const handleDone = () => {
    if (publishedItemId) onPublished?.(publishedItemId);
    onClose();
  };

  const handleSubmit = async () => {
    if (!patternResult) return;
    if (!isAuthenticated) {
      setError('发布到画册需要先登录账号');
      return;
    }
    if (!canPublish) {
      setError('当前方案暂不支持发布到画册');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const cover = generatePatternCover(patternResult);
      const response = await publishGalleryItem({
        title: title.trim(),
        description: description.trim() || undefined,
        sortWeight: 100,
        sourceType: 'community',
        tags: splitTags(tags),
        coverUrl: cover.dataUrl || coverUrl,
        previewUrl,
        coverWidth: cover.width,
        coverHeight: cover.height,
        patternDetail: {
          width: patternResult.width,
          height: patternResult.height,
          beadCount: patternResult.stats.totalCells,
          paletteCount: patternResult.stats.colorCount,
          colorStats: patternResult.palette,
          config,
          patternPayload: {
            cells: patternResult.cells,
            palette: patternResult.palette,
            stats: patternResult.stats,
          },
          sourceMetadata: {
            projectId: projectId ?? undefined,
            uploadedImageName: uploadedImage?.name,
            uploadedImageType: uploadedImage?.type,
            uploadedImageSize: uploadedImage?.size,
          },
        },
      });
      setPublishedItemId(response.itemId);
      setSuccessMessage(response.status === 'pending_review'
        ? '已提交审核，通过后会出现在公共画册。'
        : '已发布到公共画册。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gallery-publish-modal__backdrop" role="presentation" onClick={onClose}>
      <section className="gallery-publish-modal card-surface" role="dialog" aria-modal="true" aria-label="上传图纸到画册" onClick={(event) => event.stopPropagation()}>
        <div className="gallery-publish-modal__handle" aria-hidden="true" />

        <header className="gallery-publish-modal__header">
          <div>
            <p className="gallery-publish-modal__eyebrow">画册发布</p>
            <h3>上传到画册</h3>
            <span>{isAuthenticated ? `将以 ${user?.name || user?.email || (user?.username ? `@${user.username}` : '') || '当前账号'} 发布` : '登录后才能发布到公共画册'}</span>
          </div>
          <button type="button" className="gallery-publish-modal__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="gallery-publish-modal__hero">
          <div className="gallery-publish-modal__thumb">
            <div className="gallery-publish-modal__thumb-surface">
              <span>{patternResult ? `${patternResult.width}×${patternResult.height}` : '--'}</span>
              <strong>{patternResult ? `${patternResult.stats.colorCount}` : '--'}</strong>
              <small>色</small>
            </div>
          </div>
          <div className="gallery-publish-modal__hero-copy">
            <strong>{title || '未命名作品'}</strong>
            <p>{description || '填写标题和简介，让画册里的卡片更像一件完整作品。'}</p>
            {previewUrl ? <img className="gallery-publish-modal__preview" src={previewUrl} alt="图纸预览" /> : null}
          </div>
        </div>

        <div className="gallery-publish-modal__body">
          <label className="gallery-field">
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这张图纸起个名字" disabled={!isAuthenticated || submitting || Boolean(successMessage)} />
          </label>

          <label className="gallery-field">
            <span>简介</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="可选，简单描述一下作品" disabled={!isAuthenticated || submitting || Boolean(successMessage)} />
          </label>

          <label className="gallery-field">
            <span>标签</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="自然, 治愈, 可爱" disabled={!isAuthenticated || submitting || Boolean(successMessage)} />
          </label>

          <div className="gallery-publish-modal__meta">
            <div>
              <span>画布</span>
              <strong>{patternResult ? `${patternResult.width}×${patternResult.height}` : '-'}</strong>
            </div>
            <div>
              <span>颜色</span>
              <strong>{patternResult ? `${patternResult.stats.colorCount}` : '-'}</strong>
            </div>
            <div>
              <span>来源</span>
              <strong>{uploadedImage ? uploadedImage.name.replace(/\.[^.]+$/, '') : '-'}</strong>
            </div>
          </div>

          {!isAuthenticated && authStatus !== 'loading' ? (
            <p className="gallery-publish-modal__notice">发布会绑定到真实账号，游客可以继续本地创作和下载。</p>
          ) : isAuthenticated && !canPublish ? (
            <p className="gallery-publish-modal__notice">当前方案暂不支持发布到画册。</p>
          ) : null}
          {successMessage ? <p className="gallery-publish-modal__success">{successMessage}</p> : null}
          {error ? <p className="gallery-publish-modal__error">{error}</p> : null}
        </div>

        <footer className="gallery-publish-modal__footer">
          <button type="button" className="gallery-publish-modal__secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="gallery-publish-modal__primary"
            onClick={successMessage ? handleDone : isAuthenticated ? handleSubmit : handleLogin}
            disabled={!successMessage && ((isAuthenticated && !canSubmit) || submitting || authStatus === 'loading')}
          >
            {successMessage ? '完成' : authStatus === 'loading' ? '读取账号...' : isAuthenticated ? (submitting ? '正在上传...' : '确认上传') : '登录后发布'}
          </button>
        </footer>
      </section>

      <style>{`
        .gallery-publish-modal__backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: grid;
          place-items: end center;
          background: rgba(93, 83, 74, 0.28);
          backdrop-filter: blur(10px);
          padding: 18px 14px 20px;
        }
        .gallery-publish-modal {
          width: min(100%, 460px);
          border-radius: 28px 28px 22px 22px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(253, 251, 247, 0.98) 100%);
          box-shadow: 0 28px 80px rgba(93, 83, 74, 0.24);
          border: 1px solid rgba(216, 180, 226, 0.28);
          overflow: hidden;
          position: relative;
        }
        .gallery-publish-modal__handle {
          width: 44px;
          height: 5px;
          border-radius: 999px;
          background: rgba(93, 83, 74, 0.14);
          margin: 10px auto 0;
        }
        .gallery-publish-modal__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px 8px;
        }
        .gallery-publish-modal__eyebrow {
          margin: 0 0 4px;
          font-size: 11px;
          line-height: 1;
          letter-spacing: 0.18em;
          color: #b67bd2;
          font-weight: 800;
        }
        .gallery-publish-modal__header h3 {
          margin: 0;
          color: #5d534a;
          font-size: 22px;
          line-height: 1.2;
        }
        .gallery-publish-modal__header span {
          display: block;
          margin-top: 6px;
          color: rgba(93, 83, 74, 0.72);
          font-size: 13px;
        }
        .gallery-publish-modal__close {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 999px;
          background: rgba(216, 180, 226, 0.18);
          color: #5d534a;
          font-size: 22px;
          cursor: pointer;
          flex: 0 0 auto;
        }
        .gallery-publish-modal__hero {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 14px;
          padding: 8px 18px 0;
          align-items: center;
        }
        .gallery-publish-modal__thumb {
          border-radius: 22px;
          padding: 8px;
          background: linear-gradient(180deg, rgba(216, 180, 226, 0.24), rgba(181, 234, 215, 0.2));
        }
        .gallery-publish-modal__thumb-surface {
          min-height: 76px;
          border-radius: 18px;
          background: #fff;
          display: grid;
          place-items: center;
          text-align: center;
          color: #5d534a;
          box-shadow: inset 0 0 0 1px rgba(93, 83, 74, 0.06);
        }
        .gallery-publish-modal__thumb-surface span {
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        }
        .gallery-publish-modal__thumb-surface strong {
          font-size: 22px;
          line-height: 1;
          margin-top: 4px;
        }
        .gallery-publish-modal__thumb-surface small {
          font-size: 12px;
          opacity: 0.75;
        }
        .gallery-publish-modal__hero-copy strong {
          display: block;
          color: #5d534a;
          font-size: 16px;
          margin-bottom: 6px;
        }
        .gallery-publish-modal__hero-copy p {
          margin: 0;
          color: rgba(93, 83, 74, 0.68);
          font-size: 13px;
          line-height: 1.6;
        }
        .gallery-publish-modal__body {
          padding: 14px 18px 0;
          display: grid;
          gap: 12px;
        }
        .gallery-field {
          display: grid;
          gap: 8px;
        }
        .gallery-field span {
          font-size: 13px;
          font-weight: 700;
          color: #5d534a;
        }
        .gallery-field input,
        .gallery-field textarea {
          width: 100%;
          border: 1px solid rgba(181, 170, 162, 0.36);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.96);
          color: #5d534a;
          padding: 12px 14px;
          font-size: 14px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
        }
        .gallery-field input:focus,
        .gallery-field textarea:focus {
          border-color: rgba(216, 180, 226, 0.95);
          box-shadow: 0 0 0 4px rgba(216, 180, 226, 0.18);
        }
        .gallery-field input:disabled,
        .gallery-field textarea:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }
        .gallery-field textarea {
          resize: none;
          min-height: 94px;
        }
        .gallery-publish-modal__meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          padding: 4px 0 0;
        }
        .gallery-publish-modal__meta > div {
          border-radius: 18px;
          padding: 12px 10px;
          background: rgba(216, 180, 226, 0.12);
          text-align: center;
        }
        .gallery-publish-modal__meta span {
          display: block;
          font-size: 11px;
          color: rgba(93, 83, 74, 0.66);
          margin-bottom: 4px;
        }
        .gallery-publish-modal__meta strong {
          color: #5d534a;
          font-size: 14px;
        }
        .gallery-publish-modal__error {
          margin: 0;
          color: #c55d7a;
          font-size: 13px;
          padding: 0 2px;
        }
        .gallery-publish-modal__notice,
        .gallery-publish-modal__success {
          margin: 0;
          font-size: 13px;
          line-height: 1.6;
          padding: 0 2px;
        }
        .gallery-publish-modal__notice {
          color: rgba(93, 83, 74, 0.72);
        }
        .gallery-publish-modal__success {
          color: #4f8f67;
          font-weight: 700;
        }
        .gallery-publish-modal__footer {
          display: grid;
          grid-template-columns: 112px 1fr;
          gap: 12px;
          padding: 16px 18px 18px;
        }
        .gallery-publish-modal__secondary,
        .gallery-publish-modal__primary {
          height: 54px;
          border: 0;
          border-radius: 18px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }
        .gallery-publish-modal__secondary {
          background: rgba(93, 83, 74, 0.08);
          color: #5d534a;
        }
        .gallery-publish-modal__primary {
          background: linear-gradient(90deg, #d8b4e2 0%, #c8a7f0 100%);
          color: #fff;
          box-shadow: 0 10px 24px rgba(216, 180, 226, 0.35);
        }
        .gallery-publish-modal__primary:disabled,
        .gallery-publish-modal__secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 420px) {
          .gallery-publish-modal__hero,
          .gallery-publish-modal__footer {
            grid-template-columns: 1fr;
          }
          .gallery-publish-modal__meta {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
