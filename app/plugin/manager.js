const { EventEmitter } = require('events');
const { PluginLoader } = require('./loader');
const { PluginSandbox } = require('./sandbox');
const { logger } = require('../utils/logger');
const chokidar = require('chokidar');
const path = require('path');

class PluginManager extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.plugins = new Map(); // 插件ID -> 插件实例
    this.loader = new PluginLoader(this);
    this.sandbox = new PluginSandbox(this);
    this.pluginDir = bot.config.pluginDir || path.join(process.cwd(), 'plugins');
    this.watcher = null;
  }

  /**
   * 初始化插件管理器
   */
  async initialize() {
    logger.info(`插件目录: ${this.pluginDir}`);
    
    // 如果启用了热重载，设置文件监听器
    if (this.bot.config.pluginHotReload) {
      this.setupWatcher();
    }
  }

  /**
   * 加载所有插件
   */
  async loadPlugins() {
    logger.info('开始加载插件...');
    
    const pluginFiles = await this.loader.findPluginFiles();
    logger.info(`发现 ${pluginFiles.length} 个插件文件`);
    
    for (const file of pluginFiles) {
      await this.loadPlugin(file);
    }
    
    logger.info(`插件加载完成，共加载 ${this.plugins.size} 个插件`);
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(filePath) {
    try {
      const pluginId = this.getPluginId(filePath);
      
      // 如果插件已加载，先卸载
      if (this.plugins.has(pluginId)) {
        await this.unloadPlugin(pluginId);
      }
      
      // 加载插件模块
      const pluginModule = await this.loader.loadPluginModule(filePath);
      
      // 在沙箱中初始化插件
      const plugin = await this.sandbox.initializePlugin(pluginModule, filePath);
      
      // 存储插件
      this.plugins.set(pluginId, {
        id: pluginId,
        path: filePath,
        instance: plugin,
        module: pluginModule,
        loadedAt: new Date()
      });
      
      logger.info(`插件加载成功: ${pluginId} (${filePath})`);
      this.emit('plugin-loaded', pluginId, plugin);
      return true;
    } catch (error) {
      logger.error(`插件加载失败: ${filePath}`, error);
      return false;
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId) {
    try {
      if (!this.plugins.has(pluginId)) {
        return false;
      }
      
      const pluginInfo = this.plugins.get(pluginId);
      
      // 调用插件的卸载方法
      if (typeof pluginInfo.instance.onUnload === 'function') {
        await pluginInfo.instance.onUnload();
      }
      
      // 从插件列表中移除
      this.plugins.delete(pluginId);
      
      logger.info(`插件卸载成功: ${pluginId}`);
      this.emit('plugin-unloaded', pluginId);
      return true;
    } catch (error) {
      logger.error(`插件卸载失败: ${pluginId}`, error);
      return false;
    }
  }

  /**
   * 处理消息，分发给插件
   */
  async handleMessage(context) {
    let handled = false;
    
    // 遍历所有插件，调用消息处理方法
    for (const [pluginId, pluginInfo] of this.plugins) {
      try {
        // 检查插件是否有消息处理方法
        if (typeof pluginInfo.instance.onMessage === 'function') {
          // 调用插件的消息处理方法
          const result = await pluginInfo.instance.onMessage(context);
          
          // 如果插件处理了消息，且返回true，则停止后续插件处理
          if (result === true) {
            handled = true;
            break;
          }
        }
        
        // 检查是否有命令处理方法
        if (context.isCommand && typeof pluginInfo.instance.onCommand === 'function') {
          const result = await pluginInfo.instance.onCommand(context);
          if (result === true) {
            handled = true;
            break;
          }
        }
      } catch (error) {
        logger.error(`插件 ${pluginId} 处理消息出错`, error);
      }
    }
    
    return handled;
  }

  /**
   * 处理事件，分发给插件
   */
  async handleEvent(event) {
    for (const [pluginId, pluginInfo] of this.plugins) {
      try {
        if (typeof pluginInfo.instance.onEvent === 'function') {
          await pluginInfo.instance.onEvent(event);
        }
      } catch (error) {
        logger.error(`插件 ${pluginId} 处理事件出错`, error);
      }
    }
  }

  /**
   * 根据文件路径生成插件ID
   */
  getPluginId(filePath) {
    const relativePath = path.relative(this.pluginDir, filePath);
    return relativePath.replace(/\\/g, '/').replace(/\.js$/, '');
  }

  /**
   * 设置文件监听器，实现热重载
   */
  setupWatcher() {
    this.watcher = chokidar.watch(this.pluginDir, {
      ignored: /(^|\/)\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true
    });
    
    // 监听文件添加
    this.watcher.on('add', async (filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        logger.info(`检测到新插件: ${filePath}`);
        await this.loadPlugin(filePath);
      }
    });
    
    // 监听文件变化
    this.watcher.on('change', async (filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        logger.info(`插件文件已更新: ${filePath}`);
        await this.loadPlugin(filePath);
      }
    });
    
    // 监听文件删除
    this.watcher.on('unlink', async (filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        const pluginId = this.getPluginId(filePath);
        logger.info(`插件文件已删除: ${filePath}`);
        await this.unloadPlugin(pluginId);
      }
    });
    
    logger.info('插件热重载已启用');
  }

  /**
   * 获取所有插件信息
   */
  getPluginsInfo() {
    return Array.from(this.plugins.values()).map(plugin => ({
      id: plugin.id,
      path: plugin.path,
      loadedAt: plugin.loadedAt
    }));
  }
}

module.exports = { PluginManager };
