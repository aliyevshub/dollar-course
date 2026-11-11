// Telegram Bot API bilan ishlash
export class Telegram {
  // apiBase faqat lokal sinov uchun o'zgartiriladi
  constructor(token, apiBase = 'https://api.telegram.org') {
    this.base = `${apiBase}/bot${token}/`;
  }

  async call(method, params = {}) {
    const res = await fetch(this.base + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) {
      const err = new Error(`${method}: ${data.description}`);
      err.code = data.error_code;
      err.description = data.description || '';
      throw err;
    }
    return data.result;
  }

  send(chatId, text, extra = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  edit(chatId, messageId, text, extra = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  // Chek rasmini (photo yoki rasm-fayl) adminga yuborish
  sendFile(chatId, kind, fileId, caption, extra = {}) {
    const method = kind === 'document' ? 'sendDocument' : 'sendPhoto';
    return this.call(method, { chat_id: chatId, [kind === 'document' ? 'document' : 'photo']: fileId, caption, parse_mode: 'HTML', ...extra });
  }

  editCaption(chatId, messageId, caption, extra = {}) {
    return this.call('editMessageCaption', { chat_id: chatId, message_id: messageId, caption, parse_mode: 'HTML', ...extra });
  }

  answerCallback(id, text) {
    return this.call('answerCallbackQuery', { callback_query_id: id, text });
  }
}
