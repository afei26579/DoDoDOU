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
  onMirrorPattern?: () => void;
  onReuploadImage: () => void;
  onUploadToGallery?: () => void;
};

const TOOL_ICONS = {
  enlarge: '/assets/system_icons/enlarge.png',
  shrink: '/assets/system_icons/shrink.png',
  reset: '/assets/system_icons/reset.png',
  crop: '/assets/system_icons/crop.png',
  reUpload: '/assets/system_icons/re_upload.png',
  preview: '/assets/system_icons/preview.png',
  returnOriginal: '/assets/system_icons/return.png',
  regenerate: '/assets/system_icons/regenerate.png',
  autoCrop: '/assets/system_icons/crop_title.png',
  horizontalMirror: '/assets/system_icons/horizontal_mirror.png',
  uploadDrawing: '/assets/system_icons/up_drawing.png',
} as const;

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
  onMirrorPattern,
  onReuploadImage,
  onUploadToGallery,
}: WorkshopToolbarProps) {
  if (!hasImage) return null;

  const createTools = [
    { label: '放大', iconSrc: TOOL_ICONS.enlarge, onClick: onCropZoomIn },
    { label: '缩小', iconSrc: TOOL_ICONS.shrink, onClick: onCropZoomOut },
    { label: '重新上传', iconSrc: TOOL_ICONS.reUpload, onClick: onReuploadImage },
    ...(patternResultExists ? [{ label: '查看图纸', iconSrc: TOOL_ICONS.preview, onClick: onViewPattern }] : []),
  ];

  const resultTools = [
    { label: '返回原图', iconSrc: TOOL_ICONS.returnOriginal, onClick: onBackToOriginal },
    { label: '重新生成', iconSrc: TOOL_ICONS.regenerate, onClick: onRegenerate },
    { label: '自动裁剪', iconSrc: TOOL_ICONS.autoCrop, onClick: onAutoCropPattern },
    ...(patternResultExists && onMirrorPattern ? [{ label: '镜像', iconSrc: TOOL_ICONS.horizontalMirror, onClick: onMirrorPattern }] : []),
    ...(onUploadToGallery ? [{ label: '上传图纸', iconSrc: TOOL_ICONS.uploadDrawing, onClick: onUploadToGallery }] : []),
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
          <img className="workshop-canvas__tool-icon" src={item.iconSrc} alt="" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
