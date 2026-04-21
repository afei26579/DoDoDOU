import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { defaultCropTransform, defaultWorkshopConfig } from '../../features/workshop/model/defaults';
import { saveWorkshopProject } from '../../features/workshop/model/projectStore';
import { useWorkshopFlow } from '../../features/workshop/model/useWorkshopFlow';
import { generatePatternFromImage } from '../../lib/pattern/generator';
import { removePatternBackground } from '../../lib/pattern/remove-background';
import { WorkshopPage } from './WorkshopPage';

type WorkshopShellProps = {
  mode: 'create' | 'result';
};

function createProjectId() {
  return String(Date.now());
}

export function WorkshopShell({ mode }: WorkshopShellProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { state, actions, isHydrating } = useWorkshopFlow(projectId ?? null);

  const persistCurrentProject = async (nextPatternResult = state.patternResult) => {
    if (!projectId) return;
    await saveWorkshopProject(projectId, {
      uploadedImage: state.uploadedImage,
      cropTransform: state.cropTransform,
      config: state.config,
      patternResult: nextPatternResult,
      viewMode: nextPatternResult ? 'pattern' : state.viewMode,
    });
  };

  const handleGeneratePattern = async () => {
    if (!state.uploadedImage || !projectId) return;

    actions.setGenerating(true);
    try {
      const result = await generatePatternFromImage({
        imageUrl: state.uploadedImage.dataUrl,
        config: state.config,
      });
      actions.setPatternResult(result);
      await saveWorkshopProject(projectId, {
        uploadedImage: state.uploadedImage,
        cropTransform: state.cropTransform,
        config: state.config,
        patternResult: result,
        viewMode: 'pattern',
      });
      navigate(`/workshop/result/${projectId}`);
    } finally {
      actions.setGenerating(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!state.patternResult) return;

    const result = removePatternBackground(state.patternResult);
    if (!result) return;

    actions.setPatternResult(result.newPatternResult);
    await persistCurrentProject(result.newPatternResult);
  };

  const handleUploadSelected = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const nextProjectId = createProjectId();
    await saveWorkshopProject(nextProjectId, {
      uploadedImage: {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
      },
      cropTransform: defaultCropTransform,
      config: defaultWorkshopConfig,
      patternResult: null,
      viewMode: 'image',
    });

    navigate(`/workshop/create/${nextProjectId}`);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          await handleUploadSelected(file);
        }}
      />
      <WorkshopPage
        flowState={state}
        projectId={projectId ?? null}
        mode={mode}
        isHydrating={isHydrating}
        isHome={false}
        onConfigChange={actions.setConfig}
        onCropTransformChange={actions.setCropTransform}
        onGeneratePattern={handleGeneratePattern}
        onSwitchViewMode={actions.setViewMode}
        onBackToOriginal={() => navigate(`/workshop/create/${projectId ?? createProjectId()}`)}
        onRegenerate={handleGeneratePattern}
        onRemoveBackground={handleRemoveBackground}
        onUploadImage={() => {
          console.debug('[workshop] file input click requested', { projectId, hasInput: Boolean(fileInputRef.current) });
          fileInputRef.current?.click();
          window.setTimeout(() => {
            console.debug('[workshop] file input click finished', { activeElement: document.activeElement?.tagName });
          }, 0);
        }}
        onReuploadImage={() => {
          console.debug('[workshop] reupload requested', { projectId });
          fileInputRef.current?.click();
        }}
        onViewPattern={() => navigate(`/workshop/result/${projectId ?? createProjectId()}`)}
      />
    </>
  );
}
