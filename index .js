const { Bot } = require('./app/bot');
const { logger } = require('./app/utils/logger');
const config = require('./config/config');

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason, 'Promise:', promise);
});

// 初始化并启动机器人
async function start() {
  try {
    logger.info('正在启动天心Bot...');
    const bot = new Bot(config);
    await bot.initialize();
    await bot.start();
    logger.info('天心Bot启动成功！');
  } catch (error) {
    logger.error('天心Bot启动失败:', error);
    process.exit(1);
  }
}

// 启动机器人
start();
