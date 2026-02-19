export default {
  // Common
  common: {
    save: '保存',
    load: '加载',
    clear: '清空',
    delete: '删除',
    cancel: '取消',
    confirm: '确认',
    add: '添加',
    edit: '编辑',
    close: '关闭',
    connect: '连接',
    disconnect: '断开',
    read: '读取',
    write: '写入',
    scan: '扫描',
    stop: '停止',
    export: '导出',
    showLog: '显示日志',
    hideLog: '隐藏日志',
    settings: '设置',
    language: '语言',
    returnToHome: '返回主页'
  },

  // Navigation
  nav: {
    client: '客户端',
    server: '服务端',
    split: '分屏'
  },

  // Client Mode
  client: {
    title: 'Modbus 客户端',
    connection: {
      title: '连接设置',
      protocol: '协议',
      unitId: '单元 ID',
      host: '主机地址',
      port: '端口',
      comPort: '串口',
      baudRate: '波特率',
      dataBits: '数据位',
      stopBits: '停止位',
      parity: '校验位'
    },
    register: {
      title: '寄存器配置',
      type: '寄存器类型',
      address: '地址',
      length: '长度',
      pollRate: '轮询间隔 (ms)',
      timeout: '超时时间 (ms)',
      littleEndian: '小端模式',
      advancedMode: '高级模式',
      readConfiguration: '使用配置读取',
      addressBase: '地址基址'
    },
    actions: {
      startPolling: '开始轮询',
      stopPolling: '停止轮询',
      scanUnitIds: '扫描单元 ID',
      scanRegisters: '扫描寄存器'
    },
    messages: {
      connected: '已连接到服务器',
      disconnected: '已断开服务器连接',
      reconnecting: '连接丢失，正在重连...',
      alreadyConnected: '已经连接',
      alreadyDisconnected: '已经断开',
      cannotRead: '无法读取，未连接',
      cannotScanWhilePolling: '轮询期间无法扫描'
    }
  },

  // Server Mode
  server: {
    title: 'Modbus 服务端',
    configuration: '服务器配置',
    addServer: '添加服务器',
    removeServer: '删除服务器',
    unitId: '单元 ID',
    port: '端口',
    registers: {
      title: '寄存器',
      addRegister: '添加寄存器',
      editRegister: '编辑寄存器',
      address: '地址',
      type: '数据类型',
      value: '数值',
      length: '长度 (寄存器数)',
      littleEndian: '小端模式',
      scale: '缩放因子',
      comment: '注释'
    },
    dataTypes: {
      int16: '有符号短整型',
      uint16: '无符号短整型',
      int32: '有符号整型',
      uint32: '无符号整型',
      int64: '有符号长整型',
      uint64: '无符号长整型',
      float: '单精度浮点',
      double: '双精度浮点',
      unix: 'Unix 时间戳',
      datetime: '日期时间 (IEC 870-5)',
      utf8: 'UTF-8 字符串',
      bool: '布尔值'
    },
    messages: {
      serverStarted: '服务器已启动',
      serverStopped: '服务器已停止',
      portInUse: '端口已被占用'
    }
  },

  // Transaction Log
  transaction: {
    title: '通讯日志',
    timestamp: '时间戳',
    unitId: 'ID',
    address: '地址',
    function: '功能码',
    request: '请求',
    response: '响应',
    error: '错误',
    noTransactions: '暂无通讯记录'
  },

  // Register Types
  registerTypes: {
    coils: '线圈',
    discrete_inputs: '离散输入',
    input_registers: '输入寄存器',
    holding_registers: '保持寄存器'
  },

  // Data Types
  dataTypes: {
    int16: 'Int16',
    uint16: 'UInt16',
    int32: 'Int32',
    uint32: 'UInt32',
    int64: 'Int64',
    uint64: 'UInt64',
    float: 'Float',
    double: 'Double',
    unix: 'Unix 时间戳',
    datetime: '日期时间',
    utf8: 'UTF-8',
    bool: '布尔值'
  },

  // Error Messages
  errors: {
    connectionFailed: '连接失败',
    readFailed: '读取失败',
    writeFailed: '写入失败',
    invalidAddress: '无效地址',
    invalidValue: '无效数值',
    timeout: '请求超时',
    unknownError: '未知错误'
  }
}
