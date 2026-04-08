const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();

// 钉钉服务
const { createDingTalkService } = require('./services/dingtalk');
const { createReportGenerator } = require('./services/reportGenerator');
const { startScheduler, stopScheduler, triggerPush } = require('./services/scheduler');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 数据目录
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化配置文件
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    gitlabUrl: '',
    token: '',
    username: '',
    aiApiUrl: '',
    aiApiKey: '',
    aiModel: 'gpt-3.5-turbo',
    dingtalk: {
      enabled: false,
      webhookUrl: '',
      secret: '',
      pushTime: '18:00',
      pushDays: [1, 2, 3, 4, 5],
      autoGenerate: true,
      lastPushAt: null
    }
  }, null, 2));
}

// 初始化历史文件
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
}

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 读取配置
function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    return {
      gitlabUrl: '',
      token: '',
      username: '',
      jobTitle: '',
      aiApiUrl: '',
      aiApiKey: '',
      aiModel: 'gpt-3.5-turbo',
      dingtalk: {
        enabled: false,
        webhookUrl: '',
        secret: '',
        pushTime: '18:00',
        pushDays: [1, 2, 3, 4, 5],
        autoGenerate: true,
        lastPushAt: null
      }
    };
  }
}

// 保存配置
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 读取历史
function getHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch (err) {
    return {};
  }
}

// 保存历史
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// API: 获取配置
app.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json({
    gitlabUrl: config.gitlabUrl,
    token: config.token || '',
    username: config.username || '',
    jobTitle: config.jobTitle || '',
    hasToken: !!config.token,
    isConfigured: !!(config.gitlabUrl && config.token),
    aiApiUrl: config.aiApiUrl || '',
    aiApiKey: config.aiApiKey || '',
    hasAiKey: !!config.aiApiKey,
    aiModel: config.aiModel || 'gpt-3.5-turbo'
  });
});

// API: 保存配置
app.post('/api/config', (req, res) => {
  const { gitlabUrl, token, username, jobTitle, aiApiUrl, aiApiKey, aiModel } = req.body;

  if (!gitlabUrl || !token) {
    return res.status(400).json({ error: 'GitLab 地址和访问令牌为必填项' });
  }

  const config = getConfig();
  config.gitlabUrl = gitlabUrl.replace(/\/$/, '');
  config.token = token;
  config.username = username || '';
  config.jobTitle = jobTitle || '';
  if (aiApiUrl !== undefined) config.aiApiUrl = aiApiUrl;
  if (aiApiKey !== undefined) config.aiApiKey = aiApiKey;
  if (aiModel !== undefined) config.aiModel = aiModel || 'gpt-3.5-turbo';

  saveConfig(config);
  res.json({ success: true });
});

// API: 获取提交记录
app.get('/api/commits', async (req, res) => {
  const config = getConfig();

  if (!config.gitlabUrl || !config.token) {
    return res.status(400).json({ error: '请先配置 GitLab 信息' });
  }

  const days = parseInt(req.query.days) || 1;
  const baseUrl = config.gitlabUrl;
  const token = config.token;

  try {
    const userRes = await fetch(`${baseUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token, 'User-Agent': 'Daily-Report-Helper' }
    });

    if (!userRes.ok) {
      if (userRes.status === 401) {
        return res.status(401).json({ error: 'GitLab 令牌无效或已过期' });
      }
      throw new Error(`获取用户信息失败: ${userRes.status}`);
    }

    const user = await userRes.json();
    const userId = user.id;

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const sinceStr = since.toISOString();

    const eventsUrl = `${baseUrl}/api/v4/users/${userId}/events?per_page=100&after=${sinceStr.split('T')[0]}`;

    const eventsRes = await fetch(eventsUrl, {
      headers: { 'PRIVATE-TOKEN': token, 'User-Agent': 'Daily-Report-Helper' }
    });

    if (!eventsRes.ok) {
      throw new Error(`获取用户事件失败: ${eventsRes.status}`);
    }

    let events = await eventsRes.json();

    let commits = [];

    events.forEach(event => {
      if ((event.action_name === 'pushed to' || event.action_name === 'pushed') && event.push_data) {
        const pushData = event.push_data;
        if (pushData.commit_title) {
          commits.push({
            id: pushData.commit_from || `${event.id}-${event.created_at}`,
            message: pushData.commit_title,
            author: event.author?.name || user.username,
            date: event.created_at,
            project: event.project_id,
            webUrl: pushData.ref
          });
        }
      }
    });

    commits.sort((a, b) => new Date(b.date) - new Date(a.date));

    const seen = new Set();
    commits = commits.filter(commit => {
      if (seen.has(commit.id)) return false;
      seen.add(commit.id);
      return true;
    });

    res.json({ commits, total: commits.length, days, user: user.username });

  } catch (err) {
    console.error('GitLab API error:', err);
    res.status(500).json({ error: `连接 GitLab 失败: ${err.message}` });
  }
});

// API: AI 生成完整日报（根据 Git 记录）
app.post('/api/ai-generate', async (req, res) => {
  const config = getConfig();
  const { days } = req.body;
  const daysCount = days || 1;
  const jobTitle = config.jobTitle || '';

  if (!config.gitlabUrl || !config.token) {
    return res.status(400).json({ error: '请先配置 GitLab 信息' });
  }

  if (!config.aiApiUrl || !config.aiApiKey) {
    return res.status(400).json({ error: '请先配置 AI API 信息' });
  }

  try {
    // 获取 Git 记录
    const userRes = await fetch(`${config.gitlabUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': config.token, 'User-Agent': 'Daily-Report-Helper' }
    });
    const user = await userRes.json();
    const userId = user.id;

    const now = new Date();
    const since = new Date(now.getTime() - daysCount * 24 * 60 * 60 * 1000);

    const eventsUrl = `${config.gitlabUrl}/api/v4/users/${userId}/events?per_page=100&after=${since.toISOString().split('T')[0]}`;
    const eventsRes = await fetch(eventsUrl, {
      headers: { 'PRIVATE-TOKEN': config.token, 'User-Agent': 'Daily-Report-Helper' }
    });
    let events = await eventsRes.json();

    let commits = [];
    events.forEach(event => {
      if ((event.action_name === 'pushed to' || event.action_name === 'pushed') && event.push_data) {
        const pushData = event.push_data;
        if (pushData.commit_title) {
          commits.push(pushData.commit_title);
        }
      }
    });

    const commitText = commits.join('\n');
    const todayStr = new Date().toISOString().split('T')[0];
    const jobContext = jobTitle ? `用户职位：${jobTitle}。` : '';

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

    const requestBody = {
      model: config.aiModel || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      max_tokens: 1500
    };

    const apiRes = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.aiApiKey}` },
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`AI API 错误: ${apiRes.status} - ${errText}`);
    }

    const data = await apiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    res.json({ result: reply.trim(), commits: commits.length });

  } catch (err) {
    console.error('AI Generate error:', err);
    res.status(500).json({ error: `生成失败: ${err.message}` });
  }
});

// API: AI 重写（对已有内容进行重写）
app.post('/api/ai-rewrite', async (req, res) => {
  const config = getConfig();
  const { today, problems, tomorrow, notes } = req.body;

  if (!config.aiApiUrl || !config.aiApiKey) {
    return res.status(400).json({ error: '请先配置 AI API 信息' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const jobTitle = config.jobTitle || '';
  const jobContext = jobTitle ? `用户职位：${jobTitle}。` : '';

  const systemPrompt = `你是一个专业的工作日报助手，优化和重写工作日报内容。
${jobContext}
要求：
1. 严格按钉钉日报格式输出
2. 不要输出任何额外解释
3. 内容要专业、简洁、有条理
4. 当前日期：${todayStr}`;

  let userContent = '';
  let hasToday = today && today.trim().length > 5;
  let hasProblems = problems && problems.trim().length > 0;
  let hasTomorrow = tomorrow && tomorrow.trim().length > 0;
  let hasNotes = notes && notes.trim().length > 0;

  userContent = `请重写以下日报内容，使其更专业简洁（保留原有意思）：

今日完成工作：
${hasToday ? today : '(未填写)'}

遇到问题及解决方案：
${hasProblems ? problems : '(未填写)'}

明日工作计划：
${hasTomorrow ? tomorrow : '(未填写)'}

备注：
${hasNotes ? notes : '(未填写)'}

要求：
1. 只重写已填写的内容，未填写的保持原样不要生成新内容
2. 每条内容重写为1-2句话，保持专业技术术语
3. 严格按以下格式输出：
【工作日报】
日期：${todayStr}

今日完成工作：
(重写后的内容，未填写则写"无")

遇到问题及解决方案：
(重写后的内容，未填写则写"无")

明日工作计划：
(重写后的内容，未填写则写"无")

备注：
(重写后的内容，未填写则写"无")`;

  try {
    const requestBody = {
      model: config.aiModel || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      max_tokens: 1500
    };

    const apiRes = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.aiApiKey}` },
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`AI API 错误: ${apiRes.status} - ${errText}`);
    }

    const data = await apiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    res.json({ result: reply.trim() });

  } catch (err) {
    console.error('AI Rewrite error:', err);
    res.status(500).json({ error: `重写失败: ${err.message}` });
  }
});

// API: 生成周报/月报
app.post('/api/ai-period-report', async (req, res) => {
  const config = getConfig();
  const { type } = req.body; // 'weekly' 或 'monthly'

  if (!config.gitlabUrl || !config.token) {
    return res.status(400).json({ error: '请先配置 GitLab 信息' });
  }

  if (!config.aiApiUrl || !config.aiApiKey) {
    return res.status(400).json({ error: '请先配置 AI API 信息' });
  }

  const days = type === 'monthly' ? 45 : 14;
  const reportType = type === 'monthly' ? '月报' : '周报';
  const jobTitle = config.jobTitle || '';

  try {
    // 获取 Git 记录
    const userRes = await fetch(`${config.gitlabUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': config.token, 'User-Agent': 'Daily-Report-Helper' }
    });
    const user = await userRes.json();
    const userId = user.id;

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const eventsUrl = `${config.gitlabUrl}/api/v4/users/${userId}/events?per_page=100&after=${since.toISOString().split('T')[0]}`;
    const eventsRes = await fetch(eventsUrl, {
      headers: { 'PRIVATE-TOKEN': config.token, 'User-Agent': 'Daily-Report-Helper' }
    });
    let events = await eventsRes.json();

    let commits = [];
    events.forEach(event => {
      if ((event.action_name === 'pushed to' || event.action_name === 'pushed') && event.push_data) {
        const pushData = event.push_data;
        if (pushData.commit_title) {
          commits.push(pushData.commit_title);
        }
      }
    });

    const commitText = commits.join('\n');
    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = since.toISOString().split('T')[0];
    const jobContext = jobTitle ? `用户职位：${jobTitle}。` : '';

    const systemPrompt = `你是一个专业的${reportType}助手，根据Git提交记录生成专业的${reportType}。
${jobContext}
要求：
1. 严格按${reportType}格式输出
2. 不要输出任何额外解释
3. 内容要专业、简洁、有条理
4. 当前日期：${todayStr}`;

    const userContent = commits.length > 0
      ? `请根据以下Git提交记录生成${reportType}（时间范围：${startDate} 至 ${todayStr}），将每条提交转化为1-2句专业工作描述，合并相同类型的任务：

${commitText}

格式：
【${reportType}】
时间范围：${startDate} ~ ${todayStr}
人员：${user.username}

完成工作：
1. xxx

（如无则写"无"）`
      : `没有Git提交记录，请根据职位生成一份合理的${reportType}（时间范围：${startDate} 至 ${todayStr}）。

职位：${jobTitle || '软件开发工程师'}

格式：
【${reportType}】
时间范围：${startDate} ~ ${todayStr}
人员：${user.username}

完成工作：
1. xxx

（如无则写"无"）`;

    const requestBody = {
      model: config.aiModel || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    const apiRes = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.aiApiKey}` },
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`AI API 错误: ${apiRes.status} - ${errText}`);
    }

    const data = await apiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    res.json({ result: reply.trim(), commits: commits.length });

  } catch (err) {
    console.error('AI Period Report error:', err);
    res.status(500).json({ error: `${reportType}生成失败: ${err.message}` });
  }
});

// API: 获取历史记录列表
app.get('/api/history', (req, res) => {
  const history = getHistory();
  const list = Object.keys(history).map(date => ({
    date,
    createdAt: history[date].createdAt,
    preview: (history[date].today || '').substring(0, 50)
  })).sort((a, b) => b.date.localeCompare(a.date));

  res.json(list);
});

// API: 获取单条历史
app.get('/api/history/:date', (req, res) => {
  const history = getHistory();
  const record = history[req.params.date];

  if (!record) {
    return res.status(404).json({ error: '记录不存在' });
  }

  res.json(record);
});

// API: 保存历史
app.post('/api/history', (req, res) => {
  const { date, content } = req.body;

  if (!date || !content) {
    return res.status(400).json({ error: '缺少日期或内容' });
  }

  const history = getHistory();
  history[date] = { ...content, createdAt: new Date().toISOString() };
  saveHistory(history);
  res.json({ success: true });
});

// API: 删除历史
app.delete('/api/history/:date', (req, res) => {
  const history = getHistory();

  if (!history[req.params.date]) {
    return res.status(404).json({ error: '记录不存在' });
  }

  delete history[req.params.date];
  saveHistory(history);
  res.json({ success: true });
});

// API: 生成日报
app.post('/api/generate', (req, res) => {
  const { today, problems, tomorrow, notes } = req.body;
  const todayStr = new Date().toISOString().split('T')[0];

  const report = `【工作日报】
日期：${todayStr}

今日完成工作：
${today || '无'}

遇到问题及解决方案：
${problems || '无'}

明日工作计划：
${tomorrow || '无'}

备注：
${notes || '无'}`;

  res.json({ report });
});

// API: 智能合并提交 - 显示完整记录
app.post('/api/smart-merge', (req, res) => {
  const { commits } = req.body;

  if (!commits || commits.length === 0) {
    return res.json({ result: '无提交记录' });
  }

  // 直接输出所有提交记录，不去重、不省略
  const lines = commits.map((commit, index) => {
    // 保留完整的 commit message，包括多行内容
    const message = commit.message.split('\n')[0].trim();
    return `${index + 1}. ${message}`;
  });

  res.json({ result: lines.join('\n') });
});

// AI 重写/生成
app.post('/api/ai-polish', async (req, res) => {
  const config = getConfig();
  const { today, problems, tomorrow, notes, type } = req.body;
  const jobTitle = config.jobTitle || '';

  if (!config.aiApiUrl || !config.aiApiKey) {
    return res.status(400).json({ error: '请先配置 AI API 信息' });
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // 检测 AI 提供商
  const apiUrl = config.aiApiUrl.toLowerCase();
  const model = (config.aiModel || '').toLowerCase();

  let provider = 'openai';
  if (apiUrl.includes('minimax') || model.includes('abab')) provider = 'minimax';
  else if (apiUrl.includes('deepseek') || model.includes('deepseek')) provider = 'deepseek';
  else if (apiUrl.includes('zhipu') || apiUrl.includes('glm') || model.includes('glm')) provider = 'zhipu';
  else if (apiUrl.includes('volcengine') || model.includes('doubao')) provider = 'volcengine';
  else if (apiUrl.includes('dashscope') || apiUrl.includes('aliyun') || model.includes('qwen')) provider = 'dashscope';

  const jobContext = jobTitle ? `用户职位：${jobTitle}。` : '';

  const systemPrompt = `你是一个专业的工作日报助手，根据Git提交记录或职位信息，生成专业的钉钉格式工作日报。
${jobContext}
要求：
1. 严格按钉钉日报格式输出
2. 不要输出任何额外解释
3. 内容要专业、简洁、有条理
4. 当前日期：${todayStr}

日报格式：
【工作日报】
日期：${todayStr}

今日完成工作：
1. xxx（如无则写"无"）

遇到问题及解决方案：
1. xxx（如无则写"无"）

明日工作计划：
1. xxx（如无则写"无"）

备注：
xxx（如无则写"无"）`;

  let userContent = '';
  if (type === 'today') {
    const hasContent = today && today.trim().length > 5;
    const hasGitRecords = today && (today.includes('feat') || today.includes('fix') || today.includes('add') || today.includes('commit'));

    if (hasContent && hasGitRecords) {
      // 有 Git 记录：优化续写
      userContent = `请将以下Git提交记录优化为更专业的日报格式，每条1-2句话，保留关键信息：
${today}`;
    } else if (hasContent) {
      // 有手写内容：润色优化
      userContent = `请优化润色以下工作内容，使其更专业简洁（保留原有意思）：
${today}`;
    } else if (jobTitle) {
      // 无内容但有职位：根据职位生成
      userContent = `用户职位是${jobTitle}。请根据这个职位，生成3-5条合理的今日开发工作内容，使用技术术语专业描述。`;
    } else {
      // 都没有：通用开发工作
      userContent = `请生成5条左右合理的软件开发日常工作内容，使用专业技术术语描述。`;
    }
  } else if (type === 'problems') {
    if (today && today.trim().length > 5) {
      userContent = `根据今日工作内容 "${today}"，生成1-2条可能遇到的问题及解决方案。如果工作简单顺利，可以写"无"。`;
    } else if (jobTitle) {
      userContent = `作为${jobTitle}，请生成1-2条常见的开发问题及解决方案。`;
    } else {
      userContent = `请生成1-2条软件开发常见问题及解决方案。`;
    }
  } else if (type === 'tomorrow') {
    if (today && today.trim().length > 5) {
      userContent = `基于今日工作 "${today}"，为明日生成3-5条合理的工作计划。`;
    } else if (jobTitle) {
      userContent = `作为${jobTitle}，为明日生成3-5条合理的工作计划。`;
    } else {
      userContent = `请为明日生成3-5条软件开发工作计划。`;
    }
  } else if (type === 'notes') {
    userContent = `请生成简要的备注内容（如无特殊情况写"无"）。`;
  } else if (type === 'full') {
    // 根据是否有内容或职位来生成合适的提示
    const hasTodayContent = today && today.trim().length > 5;
    const hasJob = jobTitle ? true : false;

    if (hasTodayContent) {
      // 有今日工作内容，让AI续写完善其他字段
      userContent = `请根据以下今日工作内容，为其余字段生成合适的日报内容（使用专业技术术语）：

今日工作内容：
${today}

要求：
1. 遇到问题及解决方案：如无问题请直接写"无"，不要加编号
2. 明日工作计划：生成3-5条，每条一句话，不要加编号
3. 备注：如无则写"无"，不要加编号

严格按以下格式输出（不要添加任何标题说明）：
【工作日报】
日期：${todayStr}

今日完成工作：
${today}

遇到问题及解决方案：
（如无则写"无"）

明日工作计划：
（每条一行，不要编号）

备注：
（如无则写"无"）`;
    } else if (hasJob) {
      // 无内容但有职位，根据职位生成完整日报
      userContent = `用户职位是${jobTitle}。请根据这个职位，生成一份完整的专业工作日报。

要求：
1. 今日完成工作：3-5条，使用专业技术术语，每条一句话
2. 遇到问题及解决方案：1-2条，如无则直接写"无"
3. 明日工作计划：3-5条，每条一句话
4. 备注：如无则写"无"

严格按以下格式输出（不要添加任何标题说明）：
【工作日报】
日期：${todayStr}

今日完成工作：
（每条一行，不要编号）

遇到问题及解决方案：
（如无则写"无"）

明日工作计划：
（每条一行，不要编号）

备注：
（如无则写"无"）`;
    } else {
      // 什么都没有，生成通用日报
      userContent = `请生成一份完整的软件开发工作日报，使用专业技术术语。

严格按以下格式输出：
【工作日报】
日期：${todayStr}

今日完成工作：
1. xxx

遇到问题及解决方案：
1. xxx（如无则写"无"）

明日工作计划：
1. xxx

备注：
xxx（如无则写"无"）`;
    }
  }

  try {
    const requestBody = {
      model: config.aiModel || getDefaultModel(provider),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7
    };

    switch (provider) {
      case 'minimax':
        requestBody.tokens_to_generate = 1000;
        requestBody.top_p = 0.95;
        break;
      case 'zhipu':
        requestBody.max_tokens = 1000;
        requestBody.top_p = 0.95;
        break;
      default:
        requestBody.max_tokens = 1000;
    }

    const apiRes = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: getHeaders(provider, config.aiApiKey),
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`AI API 错误: ${apiRes.status} - ${errText}`);
    }

    const data = await apiRes.json();
    const reply = parseAiResponse(data, provider);

    res.json({ result: reply.trim() });

  } catch (err) {
    console.error('AI API error:', err);
    res.status(500).json({ error: `AI 处理失败: ${err.message}` });
  }
});

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

function getHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'volcengine') {
    headers['Volc-Doubao-Version'] = '2024-12-01';
  }

  return headers;
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

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ 钉钉 API ============

// API: 获取钉钉配置
app.get('/api/dingtalk/config', (req, res) => {
  const config = getConfig();
  const dingtalk = config.dingtalk || {
    enabled: false,
    webhookUrl: '',
    secret: '',
    pushTime: '18:00',
    pushDays: [1, 2, 3, 4, 5],
    autoGenerate: true,
    lastPushAt: null
  };

  res.json({
    enabled: dingtalk.enabled,
    webhookUrl: dingtalk.webhookUrl || '',
    secret: dingtalk.secret || '',
    pushTime: dingtalk.pushTime || '18:00',
    pushDays: dingtalk.pushDays || [1, 2, 3, 4, 5],
    autoGenerate: dingtalk.autoGenerate !== false,
    lastPushAt: dingtalk.lastPushAt || null,
    autoStart: config.autoStart || false,
    isConfigured: !!(dingtalk.webhookUrl)
  });
});

// API: 保存钉钉配置
app.post('/api/dingtalk/config', (req, res) => {
  const { enabled, webhookUrl, secret, pushTime, pushDays, autoGenerate } = req.body;
  const config = getConfig();

  // 初始化 dingtalk 配置
  if (!config.dingtalk) {
    config.dingtalk = {};
  }

  if (enabled !== undefined) config.dingtalk.enabled = !!enabled;
  if (webhookUrl !== undefined) config.dingtalk.webhookUrl = webhookUrl || '';
  if (secret !== undefined) config.dingtalk.secret = secret || '';
  if (pushTime !== undefined) config.dingtalk.pushTime = pushTime || '18:00';
  if (pushDays !== undefined) config.dingtalk.pushDays = pushDays || [1, 2, 3, 4, 5];
  if (autoGenerate !== undefined) config.dingtalk.autoGenerate = !!autoGenerate;

  saveConfig(config);

  // 更新定时任务
  if (config.dingtalk.enabled) {
    startScheduler(config);
  } else {
    stopScheduler();
  }

  res.json({ success: true });
});

// API: 发送测试消息
app.post('/api/dingtalk/test', async (req, res) => {
  const config = getConfig();
  const { webhookUrl, secret } = req.body;

  if (!webhookUrl) {
    return res.status(400).json({ error: '请提供 Webhook URL' });
  }

  const dingtalkService = createDingTalkService({
    webhookUrl,
    secret: secret || ''
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const result = await dingtalkService.sendMarkdown(
    '日报助手 - 测试消息',
    `这是一条测试消息\n\n发送时间：${todayStr}\n\n如果收到此消息，说明配置正确！`
  );

  if (result.success) {
    res.json({ success: true, message: '测试消息发送成功' });
  } else {
    res.status(500).json({ error: result.error || '发送失败' });
  }
});

// API: 手动触发推送
app.post('/api/dingtalk/push', async (req, res) => {
  const config = getConfig();
  const dingtalk = config.dingtalk || {};

  if (!dingtalk.webhookUrl) {
    return res.status(400).json({ error: '请先配置钉钉 Webhook' });
  }

  try {
    const generator = createReportGenerator(config);
    const result = await generator.generate(1);

    const dingtalkService = createDingTalkService({
      webhookUrl: dingtalk.webhookUrl,
      secret: dingtalk.secret || ''
    });

    const sendResult = await dingtalkService.sendMarkdown(
      `${result.user} - 工作日报`,
      result.report
    );

    if (sendResult.success) {
      // 更新最后推送时间
      config.dingtalk.lastPushAt = new Date().toISOString();
      saveConfig(config);

      res.json({
        success: true,
        message: '推送成功',
        report: result.report,
        commits: result.commits
      });
    } else {
      res.status(500).json({ error: sendResult.error || '推送失败' });
    }
  } catch (err) {
    console.error('手动推送失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Cron 定时触发（Vercel Cron）
app.post('/api/dingtalk/cron', async (req, res) => {
  const config = getConfig();
  const dingtalk = config.dingtalk || {};

  if (!dingtalk.enabled) {
    return res.json({ message: '钉钉推送未启用' });
  }

  if (!dingtalk.webhookUrl) {
    return res.status(400).json({ error: '钉钉 Webhook 未配置' });
  }

  // 检查是否是工作日
  const today = new Date();
  const dayOfWeek = today.getDay();
  const pushDays = dingtalk.pushDays || [1, 2, 3, 4, 5];

  if (!pushDays.includes(dayOfWeek)) {
    return res.json({ message: '今日不是推送日' });
  }

  try {
    const generator = createReportGenerator(config);
    const result = await generator.generate(1);

    const dingtalkService = createDingTalkService({
      webhookUrl: dingtalk.webhookUrl,
      secret: dingtalk.secret || ''
    });

    const sendResult = await dingtalkService.sendMarkdown(
      `${result.user} - 工作日报`,
      result.report
    );

    if (sendResult.success) {
      config.dingtalk.lastPushAt = new Date().toISOString();
      saveConfig(config);

      res.json({
        success: true,
        message: '定时推送成功',
        commits: result.commits
      });
    } else {
      res.status(500).json({ error: sendResult.error || '推送失败' });
    }
  } catch (err) {
    console.error('Cron 推送失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log(`日报助手已启动: http://localhost:${PORT}`);
  console.log(`访问地址: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);

  // 初始化钉钉定时任务
  const config = getConfig();
  if (config.dingtalk && config.dingtalk.enabled) {
    startScheduler(config);
  }
});

// ============ 开机自启动 API ============

const { exec } = require('child_process');
const os = require('os');

// API: 设置开机自启动
app.post('/api/auto-start', (req, res) => {
  const { enabled } = req.body;

  if (process.platform !== 'win32') {
    return res.status(400).json({ error: '仅支持 Windows 系统' });
  }

  const appPath = process.execPath;
  const taskName = 'DailyReportHelper_AutoStart';
  const appTitle = '日报助手';

  if (enabled) {
    // 创建开机自启动任务
    const command = `schtasks /create /tn "${taskName}" /tr "\\"${appPath}\\" --hidden" /sc onlogon /rl limited /f`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('创建自启动任务失败:', error);
        return res.status(500).json({ error: '创建自启动任务失败' });
      }

      // 保存配置
      const config = getConfig();
      config.autoStart = true;
      saveConfig(config);

      res.json({ success: true, message: '已开启开机自启动' });
    });
  } else {
    // 删除自启动任务
    const command = `schtasks /delete /tn "${taskName}" /f`;

    exec(command, (error, stdout, stderr) => {
      // 即使删除失败也尝试保存配置
      const config = getConfig();
      config.autoStart = false;
      saveConfig(config);

      if (error) {
        // 任务可能不存在，这是正常的
        console.log('删除自启动任务（可能不存在）:', error.message);
      }

      res.json({ success: true, message: '已关闭开机自启动' });
    });
  }
});

// API: 获取自启动状态
app.get('/api/auto-start', (req, res) => {
  const config = getConfig();
  res.json({ autoStart: config.autoStart || false });
});
