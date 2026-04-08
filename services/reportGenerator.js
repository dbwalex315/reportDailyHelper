const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/**
 * 获取配置
 */
function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    return {};
  }
}

/**
 * 日报生成服务
 * 复用现有 /api/ai-generate 的逻辑
 */
class ReportGenerator {
  constructor(config) {
    this.config = config;
  }

  /**
   * 获取 GitLab 用户信息
   */
  async getGitLabUser() {
    const { gitlabUrl, token } = this.config;
    const response = await fetch(`${gitlabUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token, 'User-Agent': 'Daily-Report-Helper' }
    });

    if (!response.ok) {
      throw new Error(`获取用户信息失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取用户提交事件
   */
  async getUserEvents(userId, days) {
    const { gitlabUrl, token } = this.config;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceStr = since.toISOString().split('T')[0];

    const url = `${gitlabUrl}/api/v4/users/${userId}/events?per_page=100&after=${sinceStr}`;
    const response = await fetch(url, {
      headers: { 'PRIVATE-TOKEN': token, 'User-Agent': 'Daily-Report-Helper' }
    });

    if (!response.ok) {
      throw new Error(`获取提交记录失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 提取提交信息
   */
  extractCommits(events) {
    const commits = [];
    events.forEach(event => {
      if ((event.action_name === 'pushed to' || event.action_name === 'pushed') && event.push_data) {
        const pushData = event.push_data;
        if (pushData.commit_title) {
          commits.push(pushData.commit_title);
        }
      }
    });
    return commits;
  }

  /**
   * 调用 AI 生成日报
   */
  async generateWithAI(commits, days = 1) {
    const { aiApiUrl, aiApiKey, aiModel, jobTitle } = this.config;
    const todayStr = new Date().toISOString().split('T')[0];
    const jobContext = jobTitle ? `用户职位：${jobTitle}。` : '';
    const commitText = commits.join('\n');

    const systemPrompt = `你是一个专业的工作日报助手，根据Git提交记录生成专业的钉钉格式日报。
${jobContext}
要求：
1. 严格按钉钉日报格式输出
2. 不要输出任何额外解释
3. 内容要专业、简洁、有条理
4. 当前日期：${todayStr}`;

    const userContent = commits.length > 0
      ? `请根据以下Git提交记录生成工作日报，每条提交转化为1-2句专业工作描述：

${commitText}

格式：
【工作日报】
日期：${todayStr}

今日完成工作：
1. xxx

遇到问题及解决方案：
（如无则写"无"）

明日工作计划：
1. xxx

备注：
（如无则写"无"）`
      : `没有Git提交记录，请根据职位生成一份合理的工作日报。

职位：${jobTitle || '软件开发工程师'}

格式：
【工作日报】
日期：${todayStr}

今日完成工作：
1. xxx

遇到问题及解决方案：
（如无则写"无"）

明日工作计划：
1. xxx

备注：
（如无则写"无"）`;

    // 检测 AI 提供商
    const apiUrl = aiApiUrl.toLowerCase();
    const model = (aiModel || '').toLowerCase();
    let provider = 'openai';

    if (apiUrl.includes('minimax') || model.includes('abab')) provider = 'minimax';
    else if (apiUrl.includes('deepseek') || model.includes('deepseek')) provider = 'deepseek';
    else if (apiUrl.includes('zhipu') || apiUrl.includes('glm') || model.includes('glm')) provider = 'zhipu';
    else if (apiUrl.includes('volcengine') || model.includes('doubao')) provider = 'volcengine';
    else if (apiUrl.includes('dashscope') || apiUrl.includes('aliyun') || model.includes('qwen')) provider = 'dashscope';

    const requestBody = {
      model: aiModel || getDefaultModel(provider),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7
    };

    switch (provider) {
      case 'minimax':
        requestBody.tokens_to_generate = 1500;
        requestBody.top_p = 0.95;
        break;
      case 'zhipu':
        requestBody.max_tokens = 1500;
        requestBody.top_p = 0.95;
        break;
      default:
        requestBody.max_tokens = 1500;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiApiKey}`
    };

    if (provider === 'volcengine') {
      headers['Volc-Doubao-Version'] = '2024-12-01';
    }

    const response = await fetch(aiApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API 错误: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return parseAiResponse(data, provider);
  }

  /**
   * 生成日报
   */
  async generate(days = 1) {
    const { gitlabUrl, token, aiApiUrl, aiApiKey } = this.config;

    if (!gitlabUrl || !token) {
      throw new Error('请先配置 GitLab 信息');
    }

    if (!aiApiUrl || !aiApiKey) {
      throw new Error('请先配置 AI API 信息');
    }

    // 获取 GitLab 用户
    const user = await this.getGitLabUser();
    const userId = user.id;

    // 获取提交记录
    const events = await this.getUserEvents(userId, days);
    const commits = this.extractCommits(events);

    // 调用 AI 生成
    const report = await this.generateWithAI(commits, days);

    return {
      report: report.trim(),
      commits: commits.length,
      user: user.username
    };
  }
}

function getDefaultModel(provider) {
  const defaults = {
    openai: 'gpt-3.5-turbo',
    deepseek: 'deepseek-chat',
    minimax: 'abab6.5s-chat',
    zhipu: 'glm-4-flash',
    volcengine: 'doubao-pro-32k',
    dashscope: 'qwen-turbo'
  };
  return defaults[provider] || 'gpt-3.5-turbo';
}

function parseAiResponse(data, provider) {
  // OpenAI, DeepSeek, 阿里百炼, 字节火山 格式
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  // 智谱 GLM 格式
  if (data.choices?.[0]?.text) {
    return data.choices[0].text;
  }

  // MiniMax 格式
  if (data.choices?.[0]?.messages?.[0]?.text) {
    return data.choices[0].messages[0].text;
  }

  // 通用检查
  if (data.choices && data.choices.length > 0) {
    const choice = data.choices[0];
    if (choice.message?.content) return choice.message.content;
    if (choice.text) return choice.text;
    if (choice.messages?.[0]?.text) return choice.messages[0].text;
  }

  return '';
}

/**
 * 创建日报生成器实例
 */
function createReportGenerator(config) {
  return new ReportGenerator(config);
}

module.exports = { ReportGenerator, createReportGenerator };
