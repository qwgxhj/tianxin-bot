const { logger } = require('../utils/logger');
const dayjs = require('dayjs');

class MessageProcessor {
  constructor(bot) {
    this.bot = bot;
    this.commandPrefix = bot.config.commandPrefix || ['#', ''];
  }

  /**
   * 处理消息
   */
  async process(message) {
    // 创建消息上下文
    const context = this.createContext(message);
    
    // 先触发全局消息事件
    this.bot.emit('message', context);
    
    // 检查是否是命令消息
    const commandInfo = this.parseCommand(context.message);
    if (commandInfo) {
      context.command = commandInfo.command;
      context.args = commandInfo.args;
      context.isCommand = true;
      this.bot.emit('command', context);
    }
    
    // 交给插件处理
    const handled = await this.bot.pluginManager.handleMessage(context);
    
    // 如果没有插件处理，且是命令消息，可以回复未知命令
    if (!handled && context.isCommand) {
      await this.replyUnknownCommand(context);
    }
  }

  /**
   * 创建消息上下文
   */
  createContext(message) {
    const isPrivate = message.message_type === 'private';
    const isGroup = message.message_type === 'group';
    
    return {
      bot: this.bot,
      messageId: message.message_id,
      userId: message.user_id,
      groupId: isGroup ? message.group_id : null,
      messageType: message.message_type,
      message: this.extractText(message),
      rawMessage: message.raw_message,
      messageArray: message.message,
      sender: message.sender,
      time: dayjs(message.time * 1000),
      isPrivate,
      isGroup,
      isCommand: false,
      command: null,
      args: [],
      
      // 回复消息的快捷方法
      reply: async (content) => {
        if (isPrivate) {
          return this.bot.sendPrivateMsg(message.user_id, content);
        } else {
          return this.bot.sendGroupMsg(message.group_id, content);
        }
      }
    };
  }

  /**
   * 从消息中提取纯文本
   */
  extractText(message) {
    if (typeof message.message === 'string') {
      return message.message;
    }
    
    return message.message.map(item => {
      if (item.type === 'text') {
        return item.data.text;
      }
      // 处理其他类型的消息，如图片、表情等
      if (item.type === 'image') {
        return `[图片]`;
      }
      if (item.type === 'face') {
        return `[表情:${item.data.id}]`;
      }
      return `[${item.type}]`;
    }).join('');
  }

  /**
   * 解析命令
   */
  parseCommand(text) {
    if (!text) return null;
    
    // 检查是否有命令前缀
    let prefix = null;
    for (const p of this.commandPrefix) {
      if (text.startsWith(p)) {
        prefix = p;
        break;
      }
    }
    
    if (!prefix) return null;
    
    // 去除前缀
    const commandText = text.slice(prefix.length).trim();
    if (!commandText) return null;
    
    // 分割命令和参数
    const parts = commandText.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    return { command, args, prefix };
  }

  /**
   * 回复未知命令
   */
  async replyUnknownCommand(context) {
    try {
      await context.reply(`未知命令: ${context.command}\n请输入 "#帮助" 查看可用命令`);
    } catch (error) {
      logger.error('回复未知命令失败:', error);
    }
  }
}

module.exports = { MessageProcessor };
