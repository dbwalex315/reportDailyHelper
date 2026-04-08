const crypto = require('crypto');

/**
 * 钉钉 Webhook 推送服务
 * 支持 Markdown 格式和签名验证
 */
class DingTalkService {
  constructor(webhookUrl, secret = '') {
    this.webhookUrl = webhookUrl;
    this.secret = secret;
  }

  /**
   * 生成签名
   */
  generateSign(timestamp) {
    const stringToSign = `${timestamp}\n${this.secret}`;
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(stringToSign);
    return encodeURIComponent(hmac.digest('base64'));
  }

  /**
   * 构建请求 URL（带签名）
   */
  buildRequestUrl() {
    if (!this.secret) {
      return this.webhookUrl;
    }

    const timestamp = Date.now();
    const sign = this.generateSign(timestamp);
    const url = new URL(this.webhookUrl);
    url.searchParams.append('timestamp', timestamp);
    url.searchParams.append('sign', sign);
    return url.toString();
  }

  /**
   * 发送文本消息
   */
  async sendText(content, atMobiles = []) {
    const body = {
      msgtype: 'text',
      text: { content },
      at: { atMobiles }
    };
    return this.send(body);
  }

  /**
   * 发送 Markdown 消息
   */
  async sendMarkdown(title, text) {
    const body = {
      msgtype: 'markdown',
      markdown: { title, text },
      at: { isAtAll: false }
    };
    return this.send(body);
  }

  /**
   * 发送消息到钉钉
   */
  async send(body) {
    const url = this.buildRequestUrl();
    const fetch = require('node-fetch');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (result.errcode === 0) {
        return { success: true };
      } else {
        return { success: false, error: result.errmsg || `错误码: ${result.errcode}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

/**
 * 创建钉钉服务实例
 */
function createDingTalkService(config) {
  const { webhookUrl, secret } = config;
  if (!webhookUrl) {
    return null;
  }
  return new DingTalkService(webhookUrl, secret);
}

module.exports = { DingTalkService, createDingTalkService };
