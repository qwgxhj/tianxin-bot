const { EventEmitter } = require('events');
const { Adapter } = require('./adapter');
const { MessageProcessor } = require('./message');
const { PluginManager } = require('../plugin/manager');
const { logger } = require('../utils/logger');
const { Database } = require('../db');
const { Redis } = require('../db/redis');

class Bot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.adapter = null;         // 协议适配器
    this.messageProcessor = null; // 消息处理器
    this.pluginManager = null;   // 插件管理器
    this.db = null;              // 数据库实例
    this.redis = null;           // Redis实例
    this.status = 'initialized'; // 机器人状态
    this.selfId = null;          // 机器人自身QQ号
  }

  /**
   * 初始化机器人组件
   */
  async initialize() {
    try {
      this.status = 'initializing';
      
      // 初始化数据库
      this.db = new Database(this.config.database);
      await this.db.connect();
      
      // 初始化Redis
      this.redis = new Redis(this.config.redis);
      await this.redis.connect();
      
      // 初始化插件管理器
      this.pluginManager = new PluginManager(this);
      await this.pluginManager.initialize();
      
      // 初始化消息处理器
      this.messageProcessor = new MessageProcessor(this);
      
      // 初始化协议适配器
      this.adapter = new Adapter(this, this.config.adapter);
      this.adapter.on('message', (data) => this.handleMessage(data));
      this.adapter.on('event', (data) => this.handleEvent(data));
      this.adapter.on('self-id', (id) => this.selfId = id);
      
      this.status = 'initialized';
      logger.info('机器人组件初始化完成');
    } catch (error) {
      logger.error('机器人初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动机器人
   */
  async start() {
    try {
      this.status = 'starting';
      
      // 启动适配器（连接到协议端）
      await this.adapter.connect();
      
      // 加载插件
      await this.pluginManager.loadPlugins();
      
      // 触发机器人启动事件
      this.emit('ready');
      this.status = 'running';
      
      logger.info(`机器人启动成功，当前状态: ${this.status}`);
    } catch (error) {
      logger.error('机器人启动失败:', error);
      this.status = 'error';
      throw error;
    }
  }

  /**
   * 处理收到的消息
   */
  async handleMessage(message) {
    try {
      logger.debug('收到消息:', JSON.stringify(message));
      await this.messageProcessor.process(message);
    } catch (error) {
      logger.error('处理消息时出错:', error);
    }
  }

  /**
   * 处理收到的事件
   */
  async handleEvent(event) {
    try {
      logger.debug('收到事件:', JSON.stringify(event));
      this.emit('event', event);
      // 通知插件有事件发生
      await this.pluginManager.handleEvent(event);
    } catch (error) {
      logger.error('处理事件时出错:', error);
    }
  }

  /**
   * 发送私聊消息
   */
  async sendPrivateMsg(userId, message) {
    return this.adapter.send('send_private_msg', {
      user_id: userId,
      message: this.formatMessage(message)
    });
  }

  /**
   * 发送群消息
   */
  async sendGroupMsg(groupId, message) {
    return this.adapter.send('send_group_msg', {
      group_id: groupId,
      message: this.formatMessage(message)
    });
  }

  /**
   * 格式化消息，使其符合协议要求
   */
  formatMessage(message) {
    // 如果是字符串，转换为CQ码格式
    if (typeof message === 'string') {
      return message;
    }
    // 如果是数组，直接返回
    if (Array.isArray(message)) {
      return message;
    }
    // 其他情况转换为字符串
    return String(message);
  }

  /**
   * 停止机器人
   */
  async stop() {
    this.status = 'stopping';
    logger.info('正在停止机器人...');
    
    // 断开适配器连接
    if (this.adapter) {
      await this.adapter.disconnect();
    }
    
    // 关闭数据库连接
    if (this.db) {
      await this.db.disconnect();
    }
    
    // 关闭Redis连接
    if (this.redis) {
      await this.redis.disconnect();
    }
    
    this.status = 'stopped';
    logger.info('机器人已停止');
  }
}

module.exports = { Bot };
