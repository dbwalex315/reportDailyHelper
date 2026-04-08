const cron = require('node-cron');
const { createDingTalkService } = require('./dingtalk');
const { createReportGenerator } = require('./reportGenerator');

let scheduledTask = null;

/**
 * 解析推送时间 "HH:MM" -> cron 表达式
 */
function parsePushTime(pushTime) {
  const [hour, minute] = pushTime.split(':');
  // 每小时的第 minute 分钟执行
  return `${minute} ${hour} * * *`;
}

/**
 * 检查是否是工作日
 * @param {number[]} pushDays - 0=周日, 1=周一, ..., 6=周六
 * @param {Date} date - 要检查的日期
 */
function isWorkday(pushDays, date) {
  const dayOfWeek = date.getDay();
  return pushDays.includes(dayOfWeek);
}

/**
 * 执行推送任务
 */
async function executePushTask(config) {
  const { dingtalk } = config;

  if (!dingtalk || !dingtalk.enabled) {
    console.log('钉钉推送未启用，跳过');
    return;
  }

  if (!dingtalk.webhookUrl) {
    console.log('钉钉 Webhook URL 未配置，跳过');
    return;
  }

  const now = new Date();
  if (!isWorkday(dingtalk.pushDays || [1, 2, 3, 4, 5], now)) {
    console.log('今日不是推送日，跳过');
    return;
  }

  console.log(`[${now.toISOString()}] 开始执行钉钉定时推送...`);

  try {
    // 生成日报
    const generator = createReportGenerator(config);
    const result = await generator.generate(1);

    console.log(`日报生成成功，包含 ${result.commits} 条提交记录`);

    // 推送到钉钉
    const dingtalkService = createDingTalkService({
      webhookUrl: dingtalk.webhookUrl,
      secret: dingtalk.secret || ''
    });

    const sendResult = await dingtalkService.sendMarkdown(
      `${result.user} - 工作日报`,
      result.report
    );

    if (sendResult.success) {
      console.log('钉钉推送成功');

      // 更新最后推送时间
      config.dingtalk.lastPushAt = new Date().toISOString();
      const fs = require('fs');
      const CONFIG_FILE = require('path').join(__dirname, '..', 'data', 'config.json');
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } else {
      console.error('钉钉推送失败:', sendResult.error);
    }
  } catch (err) {
    console.error('推送任务执行失败:', err.message);
  }
}

/**
 * 启动定时任务
 */
function startScheduler(config) {
  stopScheduler();

  const { dingtalk } = config;
  if (!dingtalk || !dingtalk.enabled) {
    console.log('钉钉定时推送未启用');
    return;
  }

  if (!dingtalk.pushTime) {
    console.log('未设置推送时间');
    return;
  }

  const cronExpression = parsePushTime(dingtalk.pushTime);
  console.log(`钉钉定时推送已启动，推送时间: ${dingtalk.pushTime}，Cron: ${cronExpression}`);

  scheduledTask = cron.schedule(cronExpression, () => {
    executePushTask(config);
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });
}

/**
 * 停止定时任务
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('钉钉定时任务已停止');
  }
}

/**
 * 手动触发推送
 */
async function triggerPush(config) {
  return executePushTask(config);
}

module.exports = {
  startScheduler,
  stopScheduler,
  triggerPush,
  executePushTask
};
