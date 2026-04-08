// 日报助手 - 前端逻辑

// AI 提供商预设配置
const AI_PRESETS = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' },
  deepseek: { url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { url: 'https://api.minimax.chat/v1', model: 'abab6.5s-chat' },
  zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  volcengine: { url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-pro-32k' },
  dashscope: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' }
};

// DOM 元素
const elements = {
  currentDate: document.getElementById('currentDate'),
  configPanel: document.getElementById('configPanel'),
  statusBar: document.getElementById('statusBar'),
  statusText: document.getElementById('statusText'),
  todayWork: document.getElementById('todayWork'),
  problems: document.getElementById('problems'),
  tomorrowPlan: document.getElementById('tomorrowPlan'),
  notes: document.getElementById('notes'),
  commitHint: document.getElementById('commitHint'),
  previewPanel: document.getElementById('previewPanel'),
  previewContent: document.getElementById('previewContent'),
  historyModal: document.getElementById('historyModal'),
  historyList: document.getElementById('historyList'),
  wordCountHint: document.getElementById('wordCountHint'),
  // 周报月报
  weeklyWork: document.getElementById('weeklyWork'),
  monthlyWork: document.getElementById('monthlyWork'),
  weeklyDateRange: document.getElementById('weeklyDateRange'),
  monthlyDateRange: document.getElementById('monthlyDateRange'),
  weeklyCommitHint: document.getElementById('weeklyCommitHint'),
  monthlyCommitHint: document.getElementById('monthlyCommitHint'),
  // 配置项
  gitlabUrl: document.getElementById('gitlabUrl'),
  token: document.getElementById('token'),
  username: document.getElementById('username'),
  jobTitle: document.getElementById('jobTitle'),
  aiProvider: document.getElementById('aiProvider'),
  aiApiUrl: document.getElementById('aiApiUrl'),
  aiApiKey: document.getElementById('aiApiKey'),
  aiModel: document.getElementById('aiModel')
};

// 当前日期
const today = new Date().toISOString().split('T')[0];
elements.currentDate.textContent = today;

// 计算日期范围
function getDateRange(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

// 设置日期范围
function initDateRanges() {
  const weekly = getDateRange(14);
  elements.weeklyDateRange.textContent = `${weekly.start} ~ ${weekly.end}`;

  const monthly = getDateRange(45);
  elements.monthlyDateRange.textContent = `${monthly.start} ~ ${monthly.end}`;
}

// Tab 切换
let currentTab = 'daily';

function switchTab(tab) {
  currentTab = tab;

  // 更新 Tab 按钮状态
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 更新页面显示
  document.querySelectorAll('.page-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'page' + tab.charAt(0).toUpperCase() + tab.slice(1));
  });

  // 根据 Tab 显示/隐藏工具栏
  const isDaily = tab === 'daily';
  document.getElementById('toolbar').style.display = isDaily ? '' : 'none';
  document.getElementById('dailyAiSection').style.display = isDaily ? '' : 'none';
  document.getElementById('dailyActions').style.display = isDaily ? '' : 'none';
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadDingTalkConfig();
  loadTodayRecord();
  initDateRanges();
});

// AI 提供商选择
function selectAiProvider(provider) {
  const preset = AI_PRESETS[provider];
  if (preset) {
    elements.aiApiUrl.value = preset.url;
    elements.aiModel.value = preset.model;
  }
}

// 显示/隐藏配置面板
function toggleConfig() {
  elements.configPanel.classList.toggle('show');
}

// 显示状态信息
function showStatus(message, type = 'info') {
  elements.statusBar.className = `status-bar show ${type}`;
  elements.statusText.textContent = message;

  setTimeout(() => {
    elements.statusBar.classList.remove('show');
  }, 3000);
}

// 显示 Toast 提示
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

// 检查字数
function checkWordCount() {
  const todayText = elements.todayWork.value.trim();
  const problemsText = elements.problems.value.trim();
  const tomorrowText = elements.tomorrowPlan.value.trim();
  const notesText = elements.notes.value.trim();

  // 今日完成工作少于30字时显示提示
  if (todayText.length > 0 && todayText.length < 30 && !elements.wordCountHint.style.display) {
    elements.wordCountHint.style.display = 'block';
  } else if (todayText.length >= 30 || todayText.length === 0) {
    elements.wordCountHint.style.display = 'none';
  }
}

// 加载配置
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();

    elements.gitlabUrl.value = data.gitlabUrl || '';
    elements.token.value = data.token || '';
    elements.username.value = data.username || '';
    elements.jobTitle.value = data.jobTitle || '';
    elements.aiApiUrl.value = data.aiApiUrl || '';
    elements.aiApiKey.value = data.aiApiKey || '';
    elements.aiModel.value = data.aiModel || 'gpt-3.5-turbo';

    // 尝试匹配 AI 提供商
    const url = data.aiApiUrl || '';
    const model = (data.aiModel || '').toLowerCase();

    if (url.includes('deepseek') || model.includes('deepseek')) {
      elements.aiProvider.value = 'deepseek';
    } else if (url.includes('minimax') || model.includes('abab')) {
      elements.aiProvider.value = 'minimax';
    } else if (url.includes('zhipu') || model.includes('glm')) {
      elements.aiProvider.value = 'zhipu';
    } else if (url.includes('volcengine') || model.includes('doubao')) {
      elements.aiProvider.value = 'volcengine';
    } else if (url.includes('dashscope') || model.includes('qwen')) {
      elements.aiProvider.value = 'dashscope';
    } else if (url.includes('openai') || model.includes('gpt')) {
      elements.aiProvider.value = 'openai';
    } else {
      elements.aiProvider.value = '';
    }

    if (data.isConfigured) {
      elements.commitHint.textContent = '已配置 GitLab';
    }

    // AI 按钮状态
    const aiEnabled = data.hasAiKey;
    document.querySelectorAll('.btn-ai').forEach(btn => {
      btn.disabled = !aiEnabled;
    });
    // 周报月报按钮也需要 AI
    document.getElementById('btnWeeklyReport').disabled = !aiEnabled;
    document.getElementById('btnMonthlyReport').disabled = !aiEnabled;
  } catch (err) {
    console.error('加载配置失败:', err);
  }
}

// 保存配置
async function saveConfig() {
  const gitlabUrl = elements.gitlabUrl.value.trim();
  const token = elements.token.value.trim();
  const username = elements.username.value.trim();
  const jobTitle = elements.jobTitle.value.trim();
  const aiApiUrl = elements.aiApiUrl.value.trim();
  const aiApiKey = elements.aiApiKey.value.trim();
  const aiModel = elements.aiModel.value.trim();

  if (!gitlabUrl) {
    showStatus('请填写 GitLab 地址', 'error');
    return;
  }

  if (!token) {
    showStatus('请填写访问令牌', 'error');
    return;
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitlabUrl, token, username, jobTitle, aiApiUrl, aiApiKey, aiModel })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    showStatus('配置已保存', 'success');
    elements.configPanel.classList.remove('show');
    elements.commitHint.textContent = '已配置 GitLab';
    elements.token.value = '';

    // 更新 AI 按钮状态
    if (aiApiKey) {
      document.querySelectorAll('.btn-ai').forEach(btn => {
        btn.disabled = false;
      });
      document.getElementById('btnWeeklyReport').disabled = false;
      document.getElementById('btnMonthlyReport').disabled = false;
    }

    // 同时保存钉钉配置
    if (dingtalkElements.enabled.checked) {
      await saveDingTalkConfig();
    }
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// 拉取 Git 提交记录
async function fetchCommits() {
  const btn = document.getElementById('btnFetch');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = '拉取中...';

  try {
    let days = 1;
    let targetElement = elements.todayWork;
    let hintElement = elements.commitHint;

    // 根据当前 Tab 确定拉取天数和目标元素
    if (currentTab === 'weekly') {
      days = 14;
      targetElement = elements.weeklyWork;
      hintElement = elements.weeklyCommitHint;
    } else if (currentTab === 'monthly') {
      days = 45;
      targetElement = elements.monthlyWork;
      hintElement = elements.monthlyCommitHint;
    }

    const res = await fetch(`/api/commits?days=${days}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '拉取失败');
    }

    if (data.total === 0) {
      targetElement.value = '';
      hintElement.textContent = '无提交记录';
      showStatus('没有找到提交记录', 'info');
      return;
    }

    // 智能合并提交
    const mergeRes = await fetch('/api/smart-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commits: data.commits })
    });

    const mergeData = await mergeRes.json();
    targetElement.value = mergeData.result;

    const periodText = days === 1 ? '24小时' : days === 14 ? '近2周' : '近45天';
    hintElement.textContent = `已拉取近${periodText} ${data.total} 条记录`;
    showStatus(`已拉取 ${data.total} 条记录`, 'success');

  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = '拉取Git';
  }
}

// 拉取周期报告的 Git 记录
async function fetchPeriodCommits(type) {
  const btnId = type === 'weekly' ? 'btnWeeklyFetch' : 'btnMonthlyFetch';
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> 拉取中...';

  try {
    const days = type === 'weekly' ? 14 : 45;
    const targetElement = type === 'weekly' ? elements.weeklyWork : elements.monthlyWork;
    const hintElement = type === 'weekly' ? elements.weeklyCommitHint : elements.monthlyCommitHint;

    const res = await fetch(`/api/commits?days=${days}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '拉取失败');
    }

    if (data.total === 0) {
      targetElement.value = '';
      hintElement.textContent = '无提交记录';
      showStatus('没有找到提交记录', 'info');
      return;
    }

    // 智能合并提交
    const mergeRes = await fetch('/api/smart-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commits: data.commits })
    });

    const mergeData = await mergeRes.json();
    targetElement.value = mergeData.result;

    const periodText = type === 'weekly' ? '近2周' : '近45天';
    hintElement.textContent = `已拉取${periodText} ${data.total} 条记录`;
    showStatus(`已拉取 ${data.total} 条记录`, 'success');

  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">📥</span> 拉取Git';
  }
}

// AI 生成功能 - 根据 Git 记录生成完整日报
async function aiGenerate() {
  const btn = document.getElementById('btnAiGenerate');
  btn.disabled = true;
  btn.textContent = '生成中...';

  try {
    const res = await fetch('/api/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 1 })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();
    const result = data.result || '';

    // 解析并填充各字段
    const parsed = parseReportSections(result);
    if (parsed.today) elements.todayWork.value = parsed.today;
    if (parsed.problems) elements.problems.value = parsed.problems;
    if (parsed.tomorrow) elements.tomorrowPlan.value = parsed.tomorrow;
    if (parsed.notes) elements.notes.value = parsed.notes;

    const msg = data.commits > 0 ? `AI 生成完成（基于 ${data.commits} 条 Git 记录）` : 'AI 生成完成';
    showToast(msg);
    checkWordCount();
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 生成';
  }
}

// AI 重写功能 - 对已有内容进行重写
async function aiRewrite() {
  const today = elements.todayWork.value.trim();
  const problems = elements.problems.value.trim();
  const tomorrow = elements.tomorrowPlan.value.trim();
  const notes = elements.notes.value.trim();

  // 如果所有字段都为空，不执行重写
  if (!today && !problems && !tomorrow && !notes) {
    showStatus('请先填写内容，再进行重写', 'info');
    return;
  }

  const btn = document.getElementById('btnAiRewrite');
  btn.disabled = true;
  btn.textContent = '重写中...';

  try {
    const res = await fetch('/api/ai-rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today, problems, tomorrow, notes })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();
    const result = data.result || '';

    // 解析并填充各字段
    const parsed = parseReportSections(result);
    if (parsed.today) elements.todayWork.value = parsed.today;
    if (parsed.problems) elements.problems.value = parsed.problems;
    if (parsed.tomorrow) elements.tomorrowPlan.value = parsed.tomorrow;
    if (parsed.notes) elements.notes.value = parsed.notes;

    showToast('AI 重写完成');
    checkWordCount();
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 重写';
  }
}

// AI 周报生成
async function aiWeeklyReport() {
  const btn = document.getElementById('btnWeeklyReport');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> 生成中...';

  try {
    const res = await fetch('/api/ai-period-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'weekly' })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();
    elements.weeklyWork.value = data.result || '';

    const msg = data.commits > 0 ? `周报生成完成（基于 ${data.commits} 条 Git 记录）` : '周报生成完成';
    elements.weeklyCommitHint.textContent = msg;
    showToast(msg);
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✨</span> AI 生成周报';
  }
}

// AI 月报生成
async function aiMonthlyReport() {
  const btn = document.getElementById('btnMonthlyReport');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> 生成中...';

  try {
    const res = await fetch('/api/ai-period-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'monthly' })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();
    elements.monthlyWork.value = data.result || '';

    const msg = data.commits > 0 ? `月报生成完成（基于 ${data.commits} 条 Git 记录）` : '月报生成完成';
    elements.monthlyCommitHint.textContent = msg;
    showToast(msg);
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✨</span> AI 生成月报';
  }
}

// 复制周报
async function copyWeeklyReport() {
  const content = elements.weeklyWork.value;
  if (!content) {
    showStatus('周报内容为空', 'info');
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    showToast('周报已复制到剪贴板');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('周报已复制到剪贴板');
  }
}

// 复制月报
async function copyMonthlyReport() {
  const content = elements.monthlyWork.value;
  if (!content) {
    showStatus('月报内容为空', 'info');
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    showToast('月报已复制到剪贴板');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('月报已复制到剪贴板');
  }
}

// 解析 AI 返回的日报内容
function parseReportSections(text) {
  const result = { today: '', problems: '', tomorrow: '', notes: '' };
  if (!text) return result;

  // 提取各章节内容
  const sections = [
    { name: '今日完成工作', key: 'today' },
    { name: '遇到问题及解决方案', key: 'problems' },
    { name: '明日工作计划', key: 'tomorrow' },
    { name: '备注', key: 'notes' }
  ];

  sections.forEach((section, index) => {
    const nextSection = sections[index + 1];
    const startIdx = text.indexOf(section.name);
    const endIdx = nextSection ? text.indexOf(nextSection.name) : text.length;

    if (startIdx !== -1) {
      let content = text.substring(startIdx + section.name.length, endIdx);
      // 清理标题后的冒号、换行、空格
      content = content.replace(/^[\s：:]+/, '').trim();
      // 清理编号前缀
      content = content.replace(/^\d+[\.\、\s]*/gm, '').trim();
      if (content && content !== '无') {
        result[section.key] = content;
      }
    }
  });

  return result;
}

// 生成日报
function generateReport() {
  const todayWork = elements.todayWork.value.trim();
  const problems = elements.problems.value.trim();
  const tomorrowPlan = elements.tomorrowPlan.value.trim();
  const notes = elements.notes.value.trim();

  if (!todayWork && !problems && !tomorrowPlan && !notes) {
    showStatus('请至少填写一项内容', 'error');
    return;
  }

  const report = `【工作日报】
日期：${today}

今日完成工作：
${todayWork || '无'}

遇到问题及解决方案：
${problems || '无'}

明日工作计划：
${tomorrowPlan || '无'}

备注：
${notes || '无'}`;

  elements.previewContent.textContent = report;
  elements.previewPanel.classList.add('show');
  showStatus('日报已生成', 'success');
}

// 隐藏预览
function hidePreview() {
  elements.previewPanel.classList.remove('show');
}

// 复制日报
async function copyReport() {
  const todayWork = elements.todayWork.value.trim();
  const problems = elements.problems.value.trim();
  const tomorrowPlan = elements.tomorrowPlan.value.trim();
  const notes = elements.notes.value.trim();

  const report = `【工作日报】
日期：${today}

今日完成工作：
${todayWork || '无'}

遇到问题及解决方案：
${problems || '无'}

明日工作计划：
${tomorrowPlan || '无'}

备注：
${notes || '无'}`;

  try {
    await navigator.clipboard.writeText(report);
    showToast('已复制到剪贴板');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = report;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制到剪贴板');
  }
}

// 加载今日记录
async function loadTodayRecord() {
  try {
    const res = await fetch(`/api/history/${today}`);
    if (res.ok) {
      const record = await res.json();
      elements.todayWork.value = record.today || '';
      elements.problems.value = record.problems || '';
      elements.tomorrowPlan.value = record.tomorrow || '';
      elements.notes.value = record.notes || '';
      checkWordCount();
    }
  } catch (err) {
    // 忽略
  }
}

// 保存到历史
async function saveHistory() {
  const content = {
    today: elements.todayWork.value.trim(),
    problems: elements.problems.value.trim(),
    tomorrow: elements.tomorrowPlan.value.trim(),
    notes: elements.notes.value.trim()
  };

  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, content })
    });

    if (!res.ok) throw new Error('保存失败');

    showToast('已保存到历史记录');
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// 显示历史记录
async function showHistory() {
  try {
    const res = await fetch('/api/history');
    const list = await res.json();

    if (list.length === 0) {
      elements.historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
    } else {
      elements.historyList.innerHTML = list.map(item => `
        <div class="history-item">
          <div class="history-item-content" onclick="loadHistory('${item.date}')">
            <div class="history-item-date">${item.date}</div>
            <div class="history-item-preview">${item.preview || '无内容'}</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteHistory('${item.date}', event)">删除</button>
        </div>
      `).join('');
    }

    elements.historyModal.classList.add('show');
  } catch (err) {
    showStatus('加载历史失败', 'error');
  }
}

// 隐藏历史记录
function hideHistory() {
  elements.historyModal.classList.remove('show');
}

// 加载历史记录
async function loadHistory(date) {
  try {
    const res = await fetch(`/api/history/${date}`);
    const record = await res.json();

    elements.todayWork.value = record.today || '';
    elements.problems.value = record.problems || '';
    elements.tomorrowPlan.value = record.tomorrow || '';
    elements.notes.value = record.notes || '';

    hideHistory();
    checkWordCount();
    showToast(`已加载 ${date} 的记录`);
  } catch (err) {
    showStatus('加载失败', 'error');
  }
}

// 删除历史记录
async function deleteHistory(date, event) {
  event.stopPropagation();
  if (!confirm(`确定删除 ${date} 的记录吗？`)) return;

  try {
    const res = await fetch(`/api/history/${date}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');

    showToast('已删除');
    showHistory();
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// 点击模态框外部关闭
elements.historyModal.addEventListener('click', (e) => {
  if (e.target === elements.historyModal) hideHistory();
});

// ESC 键关闭模态框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideHistory();
    hidePreview();
    if (elements.configPanel.classList.contains('show')) toggleConfig();
  }
});

// ============ 钉钉配置 ============

// DOM 元素 - 钉钉配置
const dingtalkElements = {
  enabled: document.getElementById('dingtalkEnabled'),
  webhook: document.getElementById('dingtalkWebhook'),
  secret: document.getElementById('dingtalkSecret'),
  pushTime: document.getElementById('dingtalkPushTime'),
  autoGenerate: document.getElementById('dingtalkAutoGenerate'),
  autoStart: document.getElementById('autoStartEnabled'),
  configSection: document.getElementById('dingtalkConfigSection'),
  status: document.getElementById('dingtalkStatus'),
  testBtn: document.getElementById('btnDingtalkTest'),
  pushBtn: document.getElementById('btnDingtalkPush')
};

// 更新钉钉配置区块显示状态
function updateDingTalkEnabled() {
  const isEnabled = dingtalkElements.enabled.checked;
  dingtalkElements.configSection.style.display = isEnabled ? 'block' : 'none';
}

// 切换工作日按钮
function toggleDay(day) {
  const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
  if (btn) {
    btn.classList.toggle('active');
  }
}

// 切换开机自启动
async function toggleAutoStart() {
  const enabled = dingtalkElements.autoStart.checked;

  try {
    const res = await fetch('/api/auto-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '设置失败');
    }

    if (enabled) {
      showDingTalkStatus('已开启开机自启动', 'success');
    } else {
      showDingTalkStatus('已关闭开机自启动', 'success');
    }
  } catch (err) {
    showDingTalkStatus(err.message, 'error');
    // 恢复复选框状态
    dingtalkElements.autoStart.checked = !enabled;
  }
}

// 加载钉钉配置
async function loadDingTalkConfig() {
  try {
    const res = await fetch('/api/dingtalk/config');
    const data = await res.json();

    dingtalkElements.enabled.checked = data.enabled || false;
    dingtalkElements.webhook.value = data.webhookUrl || '';
    dingtalkElements.secret.value = data.secret || '';
    dingtalkElements.pushTime.value = data.pushTime || '18:00';
    dingtalkElements.autoGenerate.checked = data.autoGenerate !== false;
    dingtalkElements.autoStart.checked = data.autoStart || false;

    // 设置工作日按钮状态
    const pushDays = data.pushDays || [1, 2, 3, 4, 5];
    document.querySelectorAll('.day-btn').forEach(btn => {
      const day = parseInt(btn.dataset.day);
      btn.classList.toggle('active', pushDays.includes(day));
    });

    // 更新显示状态
    updateDingTalkEnabled();

    // 如果已配置，显示最后推送时间
    if (data.lastPushAt) {
      const lastDate = new Date(data.lastPushAt).toLocaleString('zh-CN');
      showDingTalkStatus(`最后推送: ${lastDate}`, 'info');
    }
  } catch (err) {
    console.error('加载钉钉配置失败:', err);
  }
}

// 获取选中的工作日
function getSelectedPushDays() {
  const days = [];
  document.querySelectorAll('.day-btn.active').forEach(btn => {
    days.push(parseInt(btn.dataset.day));
  });
  return days;
}

// 显示钉钉状态
function showDingTalkStatus(message, type = 'info') {
  dingtalkElements.status.textContent = message;
  dingtalkElements.status.className = 'dingtalk-status show ' + type;
}

// 保存钉钉配置
async function saveDingTalkConfig() {
  const webhookUrl = dingtalkElements.webhook.value.trim();
  const secret = dingtalkElements.secret.value.trim();
  const pushTime = dingtalkElements.pushTime.value || '18:00';
  const pushDays = getSelectedPushDays();
  const autoGenerate = dingtalkElements.autoGenerate.checked;
  const enabled = dingtalkElements.enabled.checked;

  // 如果启用但没有填写 Webhook，提示错误
  if (enabled && !webhookUrl) {
    showDingTalkStatus('请填写 Webhook URL', 'error');
    return;
  }

  // 如果启用了工作日选择但没有选择任何一天，默认选工作日
  if (pushDays.length === 0) {
    showDingTalkStatus('请至少选择一个工作日，或取消启用钉钉推送', 'error');
    return;
  }

  try {
    dingtalkElements.testBtn.disabled = true;
    dingtalkElements.pushBtn.disabled = true;

    const res = await fetch('/api/dingtalk/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        webhookUrl,
        secret,
        pushTime,
        pushDays,
        autoGenerate
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    showDingTalkStatus('钉钉配置已保存', 'success');
    setTimeout(() => {
      dingtalkElements.status.classList.remove('show');
    }, 2000);
  } catch (err) {
    showDingTalkStatus(err.message, 'error');
  } finally {
    dingtalkElements.testBtn.disabled = false;
    dingtalkElements.pushBtn.disabled = false;
  }
}

// 发送测试消息
async function testDingtalk() {
  const webhookUrl = dingtalkElements.webhook.value.trim();
  const secret = dingtalkElements.secret.value.trim();

  if (!webhookUrl) {
    showDingTalkStatus('请先填写 Webhook URL', 'error');
    return;
  }

  // 如果没有保存当前配置，先保存
  await saveDingTalkConfig();

  try {
    dingtalkElements.testBtn.disabled = true;
    dingtalkElements.testBtn.textContent = '发送中...';

    const res = await fetch('/api/dingtalk/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, secret })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '发送失败');
    }

    showDingTalkStatus('测试消息发送成功！', 'success');
  } catch (err) {
    showDingTalkStatus(err.message, 'error');
  } finally {
    dingtalkElements.testBtn.disabled = false;
    dingtalkElements.testBtn.textContent = '发送测试';
  }
}

// 立即推送
async function pushDingtalk() {
  // 如果没有保存当前配置，先保存
  await saveDingTalkConfig();

  try {
    dingtalkElements.pushBtn.disabled = true;
    dingtalkElements.pushBtn.textContent = '推送中...';
    showDingTalkStatus('正在生成日报并推送...', 'info');

    const res = await fetch('/api/dingtalk/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '推送失败');
    }

    showDingTalkStatus(`推送成功！基于 ${data.commits} 条提交记录`, 'success');

    // 如果有报告内容，显示在预览中
    if (data.report) {
      elements.previewContent.textContent = data.report;
      elements.previewPanel.classList.add('show');
    }
  } catch (err) {
    showDingTalkStatus(err.message, 'error');
  } finally {
    dingtalkElements.pushBtn.disabled = false;
    dingtalkElements.pushBtn.textContent = '立即推送';
  }
}

