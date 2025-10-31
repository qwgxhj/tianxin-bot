const vm = require('vm');
const path = require('path');
const { logger } = require('../utils/logger');
const dayjs = require('dayjs');

class PluginSandbox {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
    this.bot = pluginManager.bot;
  }

  /**
   * 初始化插件，提供兼容云崽/喵崽的环境
   */
  async initializePlugin(pluginModule, filePath) {
    // 提取插件导出的内容
    const pluginExports = pluginModule.default || pluginModule;
    
    // 如果插件是一个函数，执行它并传入机器人实例
    if (typeof pluginExports === 'function') {
      return this.createPluginFromFunction(pluginExports, filePath);
    }
    
    // 如果插件是一个对象，直接使用
    if (typeof pluginExports === 'object' && pluginExports !== null) {
      return this.adaptPluginObject(pluginExports, filePath);
    }
    
    logger.warn(`插件格式不支持: ${filePath}`);
    return {
      id: path.basename(filePath),
      onMessage: () => false
    };
  }

  /**
   * 从函数创建插件
   */
  createPluginFromFunction(pluginFunction, filePath) {
    // 创建兼容云崽的全局环境
    const sandbox = this.createSandbox(filePath);
    
    // 在沙箱中执行插件函数
    const plugin = pluginFunction(sandbox.bot, sandbox);
    
    // 适配插件接口
    return this.adaptPluginObject(plugin, filePath);
  }

  /**
   * 适配插件对象，确保符合接口规范
   */
  adaptPluginObject(plugin, filePath) {
    const pluginId = path.basename(filePath, path.extname(filePath));
    
    // 确保插件有基本的生命周期方法
    return {
      id: pluginId,
      name: plugin.name || pluginId,
      description: plugin.description || '',
      version: plugin.version || '1.0.0',
      
      // 消息处理方法
      onMessage: async (context) => {
        // 如果插件有云崽风格的消息处理方法，进行适配
        if (typeof plugin.main === 'function') {
          return this.adaptYunzaiMain(plugin.main, context);
        }
        
        // 标准的消息处理方法
        if (typeof plugin.onMessage === 'function') {
          return plugin.onMessage(context);
        }
        
        return false;
      },
      
      // 命令处理方法
      onCommand: plugin.onCommand || (() => false),
      
      // 事件处理方法
      onEvent: plugin.onEvent || (() => {}),
      
      // 插件卸载方法
      onUnload: plugin.onUnload || (() => {})
    };
  }

  /**
   * 创建沙箱环境，模拟云崽/喵崽的全局变量
   */
  createSandbox(filePath) {
    const pluginDir = path.dirname(filePath);
    
    // 模拟云崽的机器人对象
    const yunzaiBot = {
      // 发送私聊消息
      sendPrivateMsg: async (userId, message) => {
        return this.bot.sendPrivateMsg(userId, message);
      },
      
      // 发送群消息
      sendGroupMsg: async (groupId, message) => {
        return this.bot.sendGroupMsg(groupId, message);
      },
      
      // 回复消息
      reply: async (context, message) => {
        return context.reply(message);
      },
      
      // 日志系统
      logger: {
        info: (msg) => logger.info(`[插件] ${msg}`),
        warn: (msg) => logger.warn(`[插件] ${msg}`),
        error: (msg) => logger.error(`[插件] ${msg}`),
        debug: (msg) => logger.debug(`[插件] ${msg}`)
      },
      
      // 数据库相关
      db: this.bot.db,
      
      // Redis缓存
      redis: this.bot.redis,
      
      // 工具函数
      util: {
        formatDate: (date, format) => dayjs(date).format(format || 'YYYY-MM-DD HH:mm:ss'),
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
      },
      
      // 配置
      config: this.bot.config
    };
    
    // 沙箱环境
    return {
      bot: yunzaiBot,
      // 其他云崽插件可能用到的全局变量
      logger: yunzaiBot.logger,
      db: this.bot.db,
      redis: this.bot.redis,
      config: this.bot.config,
      // 路径相关
      pluginDir,
      // 工具函数
      dayjs,
      lodash: require('lodash')
    };
  }

  /**
   * 适配云崽风格的main函数
   */
  async adaptYunzaiMain(mainFunc, context) {
    try {
      // 转换上下文为云崽插件期望的格式
      const yunzaiContext = {
        user_id: context.userId,
        group_id: context.groupId,
        message: context.message,
        raw_message: context.rawMessage,
        message_type: context.messageType,
        sender: context.sender,
        // 回复方法
        reply: async (msg) => context.reply(msg),
        // 机器人实例
        bot: this.bot
      };
      
      // 调用云崽风格的main函数
      const result = await mainFunc(yunzaiContext);
      
      // 云崽插件通常返回true表示已处理
      return result === true;
    } catch (error) {
      logger.error('云崽插件处理消息出错:', error);
      return false;
    }
  }
}

module.exports = { PluginSandbox };
