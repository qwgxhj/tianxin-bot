const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const glob = require('glob');
const { logger } = require('../utils/logger');

class PluginLoader {
  constructor(pluginManager) {
    this.pluginManager = pluginManager;
    this.bot = pluginManager.bot;
    this.pluginDir = pluginManager.pluginDir;
  }

  /**
   * 查找所有插件文件
   */
  async findPluginFiles() {
    return new Promise((resolve, reject) => {
      // 查找所有.js和.mjs文件，包括子目录
      const pattern = path.join(this.pluginDir, '**', '*.{js,mjs}');
      
      glob(pattern, (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        
        // 过滤掉node_modules和其他不需要的目录
        const filteredFiles = files.filter(file => {
          const relativePath = path.relative(this.pluginDir, file);
          return !relativePath.includes('node_modules') && 
                 !relativePath.startsWith('.');
        });
        
        resolve(filteredFiles);
      });
    });
  }

  /**
   * 加载插件模块
   */
  async loadPluginModule(filePath) {
    try {
      // 清除模块缓存，确保加载最新版本
      const modulePath = path.resolve(filePath);
      
      // 对于CommonJS模块
      if (filePath.endsWith('.js') && !this.isESModule(filePath)) {
        delete require.cache[require.resolve(modulePath)];
        return require(modulePath);
      }
      
      // 对于ES模块
      const moduleUrl = new URL(`file://${modulePath}`).href;
      return import(moduleUrl);
    } catch (error) {
      logger.error(`加载插件模块失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 判断是否是ES模块
   */
  isESModule(filePath) {
    try {
      const content = fsSync.readFileSync(filePath, 'utf8');
      // 简单判断是否包含ES模块的特征
      return content.includes('import ') || 
             content.includes('export ') ||
             content.includes('from ');
    } catch (error) {
      logger.warn(`判断模块类型失败: ${filePath}`, error);
      return false;
    }
  }
}

module.exports = { PluginLoader };
