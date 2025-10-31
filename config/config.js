const path = require('path');

module.exports = {
  // 机器人名称
  name: '天心Bot',
  
  // 命令前缀
  commandPrefix: ['#', ''],
  
  // 插件目录
  pluginDir: path.join(process.cwd(), 'plugins'),
  
  // 启用插件热重载
  pluginHotReload: true,
  
  // 协议适配器配置
  adapter: {
    type: 'ws', // 支持 'ws' 或 'http'
    ws: {
      url: 'ws://127.0.0.1:3000/ws' // go-cqhttp的WebSocket地址
    },
    http: {
      port: 3000, // HTTP服务器端口
      callbackPath: '/api/callback' // 回调路径
    },
    timeout: 30000, // API调用超时时间(ms)
    reconnectDelay: 5000 // 重连延迟(ms)
  },
  
  // 数据库配置
  database: {
    type: 'sqlite', // 支持 'sqlite', 'mysql', 'postgres'
    sqlite: {
      path: path.join(process.cwd(), 'data', 'tianxin.db')
    },
    mysql: {
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      database: 'tianxin_bot'
    }
  },
  
  // Redis配置（用于缓存）
  redis: {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0
  },
  
  // 日志配置
  logger: {
    level: 'info', // 日志级别: trace, debug, info, warn, error, fatal
    file: path.join(process.cwd(), 'data', 'logs', 'tianxin.log')
  }
};
