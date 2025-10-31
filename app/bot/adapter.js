const { EventEmitter } = require('events');
const WebSocket = require('ws');
const axios = require('axios');
const { logger } = require('../utils/logger');

class Adapter extends EventEmitter {
  constructor(bot, config) {
    super();
    this.bot = bot;
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.echoCounter = 0;
    this.pendingRequests = new Map();
  }

  /**
   * 连接到go-cqhttp
   */
  async connect() {
    if (this.config.type === 'ws') {
      return this.connectWebSocket();
    } else if (this.config.type === 'http') {
      return this.setupHttpServer();
    } else {
      throw new Error(`不支持的适配器类型: ${this.config.type}`);
    }
  }

  /**
   * 通过WebSocket连接到go-cqhttp
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this.config.ws.url || 'ws://localhost:6700/ws';
      logger.info(`正在连接到go-cqhttp WebSocket: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        logger.info('WebSocket连接已建立');
        this.connected = true;
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleWebSocketMessage(data);
      });
      
      this.ws.on('close', (code, reason) => {
        logger.warn(`WebSocket连接已关闭，代码: ${code}, 原因: ${reason.toString()}`);
        this.connected = false;
        this.reconnect();
      });
      
      this.ws.on('error', (error) => {
        logger.error('WebSocket错误:', error);
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  /**
   * 处理WebSocket消息
   */
  handleWebSocketMessage(data) {
    try {
      const payload = JSON.parse(data.toString());
      
      // 处理响应消息
      if (payload.echo !== undefined) {
        const pending = this.pendingRequests.get(payload.echo);
        if (pending) {
          this.pendingRequests.delete(payload.echo);
          if (payload.status === 'ok') {
            pending.resolve(payload.data);
          } else {
            pending.reject(new Error(`API调用失败: ${payload.msg || '未知错误'}`));
          }
        }
        return;
      }
      
      // 处理事件消息
      if (payload.post_type === 'message') {
        this.emit('message', payload);
      } else if (payload.post_type === 'meta_event' && payload.meta_event_type === 'lifecycle') {
        if (payload.sub_type === 'connect') {
          logger.info('已连接到QQ服务器');
          this.emit('self-id', payload.self_id);
        }
      } else {
        this.emit('event', payload);
      }
    } catch (error) {
      logger.error('处理WebSocket消息错误:', error);
    }
  }

  /**
   * 发送请求到go-cqhttp
   */
  send(action, params = {}) {
    if (!this.connected) {
      return Promise.reject(new Error('适配器未连接'));
    }
    
    return new Promise((resolve, reject) => {
      const echo = this.echoCounter++;
      this.pendingRequests.set(echo, { resolve, reject });
      
      const payload = {
        action,
        params,
        echo
      };
      
      try {
        this.ws.send(JSON.stringify(payload));
        
        // 设置超时
        setTimeout(() => {
          if (this.pendingRequests.has(echo)) {
            this.pendingRequests.delete(echo);
            reject(new Error(`API调用超时: ${action}`));
          }
        }, this.config.timeout || 30000);
      } catch (error) {
        this.pendingRequests.delete(echo);
        reject(error);
      }
    });
  }

  /**
   * 重新连接
   */
  reconnect() {
    const delay = this.config.reconnectDelay || 5000;
    logger.info(`将在 ${delay}ms 后尝试重新连接`);
    
    setTimeout(() => {
      if (!this.connected) {
        this.connectWebSocket().catch(err => {
          logger.error('重连失败:', err);
          this.reconnect();
        });
      }
    }, delay);
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
  }

  /**
   * 设置HTTP服务器（用于go-cqhttp的HTTP回调）
   */
  async setupHttpServer() {
    const express = require('express');
    const bodyParser = require('body-parser');
    const app = express();
    
    app.use(bodyParser.json());
    
    // 处理消息回调
    app.post(this.config.http.callbackPath || '/api/callback', (req, res) => {
      const payload = req.body;
      if (payload.post_type === 'message') {
        this.emit('message', payload);
      } else {
        this.emit('event', payload);
      }
      res.json({ status: 'ok' });
    });
    
    return new Promise((resolve) => {
      const server = app.listen(this.config.http.port || 3000, () => {
        const port = server.address().port;
        logger.info(`HTTP服务器已启动，监听端口: ${port}`);
        this.connected = true;
        resolve();
      });
    });
  }
}

module.exports = { Adapter };
