// Only fixed labels leave this boundary. Never return upstream messages or bodies.
export function bridgeFailure(stage, error) {
  const stages = ['startup', 'chat_connect', 'chat_closed', 'chat_event', 'chat_response', 'xai_tts'];
  if (!stages.includes(stage)) stage = 'bridge';
  let reason = 'unavailable';
  const code = error?.code;
  if (['invalid_api_key', 'authentication_error', 'xai_tts_auth_failed'].includes(code)) reason = 'authentication';
  else if (['permission_denied', 'insufficient_permissions', 'forbidden'].includes(code)) reason = 'access_denied';
  else if (['model_not_found', 'model_not_available'].includes(code)) reason = 'model';
  else if (['insufficient_quota', 'rate_limit_exceeded', 'xai_tts_quota_or_rate_limit'].includes(code)) reason = 'quota_or_rate_limit';
  else if (['invalid_request_error', 'invalid_value', 'unknown_parameter', 'missing_required_parameter'].includes(code) || error?.type === 'invalid_request_error') reason = 'configuration';
  else if (code === 'xai_tts_invalid_response') reason = 'invalid_audio';
  // ws reports a rejected HTTP upgrade in this fixed format. Extract only status.
  if (stage === 'chat_connect') {
    const status = /^Unexpected server response: (\d{3})$/.exec(error?.message || '')?.[1];
    if (status === '401') reason = 'authentication';
    else if (status === '403') reason = 'access_denied';
    else if (status === '429') reason = 'quota_or_rate_limit';
    else if (['400', '404'].includes(status)) reason = 'configuration';
  }
  const source = stage.startsWith('chat_') ? '聊天供應商' : stage === 'xai_tts' ? 'xAI 語音' : '連線';
  const labels = { authentication: 'API 憑證遭拒（HTTP 401）；請檢查金鑰是否仍有效及 Render 設定', access_denied: '帳戶或模型存取遭拒（HTTP 403）；請檢查專案與模型權限', model: '模型不存在或帳戶無權使用', quota_or_rate_limit: '額度不足或請求過於頻繁', configuration: '模型或請求設定不被接受', invalid_audio: '回傳的音訊格式無效', unavailable: stage === 'startup' ? '建立連線逾時' : '服務中斷或暫時無法使用' };
  return { code: `${stage}:${reason}`, message: `${source}：${labels[reason]}。請結束後重新連線。錯誤碼：${stage}:${reason}` };
}
