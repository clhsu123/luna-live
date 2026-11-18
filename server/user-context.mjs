// Server-only private profile. Never commit profile values or include them in status/logs.
export function userContextEvents(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const text = value.trim().slice(0, 8000);
  return [{ type: 'conversation.item.create', item: {
    type: 'message', role: 'user', content: [{ type: 'input_text', text:
      'Background I supplied for personalization (not a new request):\n' + text +
      '\nUse this as background only. My current messages and corrections take precedence. Do not claim this is a complete or automatically synchronized ChatGPT memory. Do not recite the profile unprompted.' }],
  } }];
}
