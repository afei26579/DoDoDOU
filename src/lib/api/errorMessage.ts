export type ApiErrorPayload = {
  message?: string;
  code?: string;
  capability?: string;
  current?: number;
  limit?: number;
  used?: number;
  retryAfterSeconds?: number;
};

const capabilityLabels: Record<string, string> = {
  'gallery.favorite_sync': '收藏同步',
  'gallery.publish': '作品发布',
  'project.cloud_sync': '云端作品同步',
  'inventory.cloud_sync': '云端库存同步',
  'pattern.server_generate': '云端生成',
  'asset.upload': '图片上传',
  'export.hd': '高清导出',
  'export.no_watermark': '无水印导出',
};

function hasChineseText(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function getCapabilityLabel(capability: string | undefined) {
  return capability ? capabilityLabels[capability] ?? '该功能' : '该功能';
}

function formatPlanLimitMessage(payload: ApiErrorPayload) {
  const limitText = typeof payload.limit === 'number' ? `，最多 ${payload.limit} 个` : '';
  const currentText = typeof payload.current === 'number' ? `当前已有 ${payload.current} 个` : '当前数量已达上限';

  if (payload.capability === 'project.cloud_sync') {
    return `云端作品数量已达上限（${currentText}${limitText}）。请删除不需要的云端作品后再同步。`;
  }
  if (payload.capability === 'inventory.cloud_sync') {
    return `云端库存数量已达上限（${currentText}${limitText}）。请清理不需要的库存记录后再同步。`;
  }

  return `当前套餐额度已用完，请清理已有内容或升级套餐后再试。`;
}

function formatUsageLimitMessage(payload: ApiErrorPayload) {
  if (payload.capability === 'gallery.publish') {
    return '本月作品发布次数已用完，请下月再试或升级套餐。';
  }
  if (payload.capability === 'pattern.server_generate') {
    return '本月云端生成次数已用完，请下月再试或升级套餐。';
  }
  if (payload.capability === 'asset.upload') {
    return '本月图片上传次数已用完，请下月再试或升级套餐。';
  }

  return '本月使用次数已用完，请下月再试或升级套餐。';
}

function formatCapabilityMessage(payload: ApiErrorPayload, status: number) {
  if (status === 401) return '请先登录后再使用该功能。';
  return `当前账号暂不支持${getCapabilityLabel(payload.capability)}，请升级套餐后再试。`;
}

function getStatusMessage(status: number, fallback: string) {
  if (status === 400) return '提交内容有误，请检查后再试。';
  if (status === 401) return '请先登录后再继续。';
  if (status === 403) return '当前账号没有权限执行此操作。';
  if (status === 404) return '没有找到相关内容，可能已被删除或下架。';
  if (status === 409) return '内容已存在或状态冲突，请刷新后再试。';
  if (status === 413) return '提交内容过大，请减少数量或压缩图片后再试。';
  if (status === 429) return '操作太频繁，请稍后再试。';
  if (status >= 500) return '服务器暂时不可用，请稍后再试。';
  return fallback;
}

function translateEnglishMessage(message: string, status: number, payload: ApiErrorPayload) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes('plan limit exceeded')) return formatPlanLimitMessage(payload);
  if (normalized.includes('usage limit exceeded')) return formatUsageLimitMessage(payload);
  if (normalized.includes('capability is not available')) return formatCapabilityMessage(payload, status);
  if (normalized.includes('request body is too large')) return getStatusMessage(413, '提交内容过大，请减少数量或压缩图片后再试。');
  if (normalized.includes('rate limit exceeded')) return '操作太频繁，请稍后再试。';
  if (normalized.includes('admin authentication required')) return '请先登录管理员账号。';
  if (normalized.includes('authentication required')) return status === 403 ? '当前账号没有权限执行此操作。' : '请先登录后再继续。';
  if (normalized.includes('permission denied')) return '当前账号没有权限执行此操作。';
  if (normalized.includes('credentials are invalid') || normalized.includes('account or password is incorrect')) return '账号或密码不正确。';
  if (normalized.includes('account is not available')) return '账号当前不可用，请联系管理员。';
  if (normalized.includes('you cannot disable your own admin account')) return '不能禁用当前登录的管理员账号。';
  if (normalized.includes('you cannot remove your own admin role')) return '不能移除当前登录账号的管理员权限。';
  if (normalized.includes('origin is not allowed')) return '当前访问来源未被允许，请检查服务配置。';
  if (normalized.includes('image file is required')) return '请选择要上传的图片。';
  if (normalized.includes('gallery publish is disabled')) return '当前环境暂未开放作品发布。';
  if (normalized.includes('gallery publish token is not configured') || normalized.includes('invalid publish token')) return '作品发布配置异常，请联系管理员。';
  if (normalized.includes('gallery item not found')) return '没有找到这张作品，可能已被删除或下架。';
  if (normalized.includes('project not found')) return '没有找到这个作品，可能已被删除。';
  if (normalized.includes('inventory item not found')) return '没有找到这条库存记录，可能已被删除。';
  if (normalized.includes('source asset not found')) return '没有找到原始图片资源，请重新上传后再试。';
  if (normalized.includes('invalid gallery item id')) return '作品链接无效，请返回列表重新打开。';
  if (normalized.includes('invalid inventory item id')) return '库存记录无效，请刷新后再试。';
  if (normalized.includes('invalid user id')) return '用户信息无效，请刷新后再试。';
  if (normalized.includes('user not found')) return '没有找到该用户，可能已被删除。';
  if (normalized.includes('items must be an array') || normalized.includes('invalid') && normalized.includes('payload')) return '提交内容格式不正确，请刷新后重试。';
  if (normalized.includes('items cannot contain more than')) return '一次提交的数据过多，请分批后再试。';
  if (normalized.startsWith('request failed')) return getStatusMessage(status, '请求失败，请稍后再试。');

  return null;
}

export function getApiErrorMessage(payload: ApiErrorPayload | null | undefined, status: number, fallback = '请求失败，请稍后再试。') {
  if (payload?.code === 'PLAN_LIMIT_EXCEEDED') return formatPlanLimitMessage(payload);
  if (payload?.code === 'USAGE_LIMIT_EXCEEDED') return formatUsageLimitMessage(payload);
  if (payload?.code === 'CAPABILITY_REQUIRED') return formatCapabilityMessage(payload, status);

  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (message) {
    if (hasChineseText(message)) return message;
    const translated = translateEnglishMessage(message, status, payload ?? {});
    if (translated) return translated;
  }

  return getStatusMessage(status, fallback);
}
