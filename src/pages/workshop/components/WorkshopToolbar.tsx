type WorkshopToolbarProps = {
  mode: 'create' | 'result';
  hasImage: boolean;
  patternResultExists: boolean;
  isGenerating: boolean;
  onCropZoomIn: () => void;
  onCropZoomOut: () => void;
  onCropReset: () => void;
  onViewCropPreview: () => void;
  onViewPattern: () => void;
  onBackToOriginal: () => void;
  onRegenerate: () => void;
  onAutoCropPattern: () => void;
  onReuploadImage: () => void;
  onUploadToGallery?: () => void;
};

export function WorkshopToolbar({
  mode,
  hasImage,
  patternResultExists,
  isGenerating,
  onCropZoomIn,
  onCropZoomOut,
  onCropReset,
  onViewCropPreview,
  onViewPattern,
  onBackToOriginal,
  onRegenerate,
  onAutoCropPattern,
  onReuploadImage,
  onUploadToGallery,
}: WorkshopToolbarProps) {
  if (!hasImage) return null;

  const createTools = [
    { label: '放大', icon: '↗', onClick: onCropZoomIn },
    { label: '缩小', icon: '↙', onClick: onCropZoomOut },
    { label: '重置', icon: '↺', onClick: onCropReset },
    { label: '裁剪', icon: '⌗', onClick: onViewCropPreview },
    { label: '重新上传', icon: '↟', onClick: onReuploadImage },
    ...(patternResultExists ? [{ label: '查看图纸', icon: '▣', onClick: onViewPattern }] : []),
  ];

  const resultTools = [
    { label: '返回原图', icon: '◀', onClick: onBackToOriginal },
    { label: '重新生成', icon: '↻', onClick: onRegenerate },
    { label: '自动裁剪', icon: '⌗', onClick: onAutoCropPattern },
    ...(onUploadToGallery ? [{ label: '上传图纸', icon: '↟', onClick: onUploadToGallery }] : []),
  ];

  const tools = mode === 'create' ? createTools : resultTools;

  return (
    <div className="workshop-canvas__toolbar">
      {tools.map((item) => (
        <button
          key={item.label}
          type="button"
          className="workshop-canvas__tool workshop-canvas__tool--icon"
          aria-label={item.label}
          onClick={item.onClick}
          disabled={isGenerating}
        >
          <span className="workshop-canvas__tool-icon" aria-hidden="true">{item.icon}</span>
          <span className="workshop-canvas__tool-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
