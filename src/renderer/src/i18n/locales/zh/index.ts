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
    theme: '主题',
    themeMode: '外观模式',
    themeModeLight: '亮色',
    themeModeDark: '暗色',
    themeModeSystem: '自动（跟随系统）',
    themeColor: '主题色',
    themeColorGreen: '绿色',
    themeColorBlue: '蓝色',
    themeColorOrange: '橙色',
    themeColorRose: '玫红',
    returnToHome: '返回主页',
    view: '查看',
    refresh: '刷新',
    validate: '验证',
    continue: '继续',
    autoScroll: '自动滚动',
    moreOptions: '更多选项',
    timeSettings: '时间设置',
    pollRate: '轮询间隔',
    timeout: '超时时间',
    min: '最小值',
    max: '最大值',
    address: '地址',
    length: '长度',
    value: '数值',
    configuration: '配置',
    ok: '正常',
    error: '错误',
    bigEndian: '大端模式',
    littleEndian: '小端模式'
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
      parity: '校验位',
      ipAddress: 'IP 地址',
      tcp: 'TCP',
      rtu: 'RTU',
      refreshComPorts: '刷新串口',
      validateComPort: '验证串口'
    },
    register: {
      title: '寄存器配置',
      type: '寄存器类型',
      address: '地址',
      length: '长度',
      pollRate: '轮询间隔 (ms)',
      timeout: '超时时间 (ms)',
      littleEndian: '小端模式',
      bigEndian: '大端模式',
      advancedMode: '高级模式',
      readConfiguration: '使用配置读取',
      addressBase: '地址基址',
      addressBase0: '地址基址 0',
      addressBase1: '地址基址 1',
      configNamePlaceholder: '客户端配置名称'
    },
    actions: {
      startPolling: '开始轮询',
      stopPolling: '停止轮询',
      scanUnitIds: '扫描单元 ID',
      scanRegisters: '扫描寄存器',
      readConfigured: '读取所有已配置寄存器',
      readAll: '读取所有已配置数据类型的寄存器'
    },
    messages: {
      connected: '已连接到服务器',
      disconnected: '已断开服务器连接',
      reconnecting: '连接丢失，正在重连...',
      alreadyConnected: '已经连接',
      alreadyDisconnected: '已经断开',
      cannotRead: '无法读取，未连接',
      cannotScanWhilePolling: '轮询期间无法扫描'
    },
    config: {
      view: '查看配置',
      viewTooltip: '查看当前数据类型、缩放因子和注释配置',
      save: '保存配置',
      saveTooltip: '将数据类型、缩放因子和注释配置保存到 JSON 文件',
      load: '加载配置',
      loadTooltip: '加载 modbux 客户端配置文件',
      clear: '清除配置',
      clearTooltip: '清除数据类型、缩放因子和注释配置'
    },
    scan: {
      minUnitId: '最小单元 ID',
      maxUnitId: '最大单元 ID',
      minAddress: '最小地址',
      maxAddress: '最大地址',
      start: '开始扫描',
      stop: '停止扫描'
    },
    options: {
      advancedMode: '高级模式',
      show64bit: '显示 64 位数值'
    },
    write: {
      addressValue: '地址 {{address}} 数值',
      fc6: 'FC6: 写单个寄存器',
      fc16: 'FC16: 写多个寄存器',
      fc5: 'FC5: 写单个线圈',
      fc15: 'FC15: 写多个线圈',
      writeCoils: '写线圈'
    },
    grid: {
      interpolation: '插值'
    }
  },

  // Server Mode
  server: {
    title: 'Modbus 从站模拟器',
    configuration: '服务器配置',
    configPlaceholder: '服务器名称',
    addServer: '添加服务器',
    removeServer: '删除服务器',
    unitId: '单元 ID',
    port: '端口',
    portWithNumber: '端口 {{port}}',
    toolbar: {
      saveWorkspace: '保存工作空间',
      openWorkspace: '打开工作空间',
      newConnection: '新建连接',
      newSlave: '新建从站',
      openConnection: '打开连接',
      closeConnection: '关闭连接',
      editConnection: '编辑连接',
      editSlave: '编辑从站',
      commDetails: '通讯详情',
      editScript: '编辑脚本'
    },
    dialog: {
      newConnection: '新建连接',
      editConnection: '编辑连接',
      newSlave: '新建从站',
      editSlave: '编辑从站',
      connectionAlias: '连接别名',
      connectionMode: '连接模式',
      serialPort: '串口',
      baudRate: '波特率',
      dataBits: '数据位',
      parity: '校验位',
      stopBits: '停止位',
      flowControl: '流控',
      frameFormat: '帧格式',
      ipAddress: 'IP 地址',
      slaveAlias: '从站别名',
      slaveId: '从站 ID',
      responseDelay: '响应延迟 (ms)',
      registerInit: '寄存器初始化',
      initNone: '不初始化',
      initRandom: '随机值',
      initAddress: '寄存器地址',
      addressType: '地址类型',
      protocolAddress: '协议地址 (基址 0)',
      plcAddress: 'PLC 地址 (基址 1)',
      registerGroups: '寄存器组',
      groupName: '组名称',
      registerType: '寄存器类型',
      startAddress: '起始地址',
      count: '数量',
      addGroup: '添加寄存器组'
    },
    connection: {
      protocol: '协议',
      host: '主机地址',
      port: '端口',
      comPort: '串口',
      baudRate: '波特率',
      dataBits: '数据位',
      stopBits: '停止位',
      parity: '校验位',
      mode: {
        rtu: 'Modbus RTU',
        tcp: 'Modbus TCP/IP',
        udp: 'Modbus UDP/IP',
        rtuovertcp: 'Modbus RTU Over TCP/IP',
        rtuoverudp: 'Modbus RTU Over UDP/IP'
      }
    },
    registers: {
      title: '寄存器',
      addRegister: '添加寄存器',
      editRegister: '编辑寄存器',
      address: '地址',
      type: '数据类型',
      value: '数值',
      length: '长度 (寄存器数)',
      littleEndian: '小端模式',
      bigEndian: '大端模式',
      scale: '缩放因子',
      comment: '注释',
      minValue: '最小值',
      maxValue: '最大值',
      interval: '间隔 (秒)',
      mode: {
        fixed: '固定值',
        generator: '生成器'
      },
      actions: {
        submitChange: '提交更改',
        addAndClose: '添加并关闭',
        addAndNext: '添加并继续',
        remove: '删除'
      },
      validation: {
        inUse: '地址已被使用',
        dataTypeDoesNotFit: '数据类型不适合此地址',
        required: '此字段为必填项',
        ipAddress: 'IP地址格式无效',
        portRange: '端口号必须在1-65535之间',
        baudRate: '无效的波特率',
        slaveIdRange: '从站ID必须在1-247之间',
        positiveNumber: '必须为正数',
        countRange: '数量必须在1-65535之间'
      },
      titles: {
        edit: '编辑',
        add: '添加',
        inputRegister: '输入寄存器',
        holdingRegister: '保持寄存器'
      }
    },
    booleans: {
      add: '添加{{type}}',
      deleteAll: '删除所有{{type}}',
      toggle: '切换{{type}}地址{{address}}'
    },
    sections: {
      toggle: '折叠/展开{{name}}区域'
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
    },
    openSaveClear: {
      open: '打开配置',
      save: '保存配置',
      clear: '清除配置'
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
    noTransactions: '暂无通讯记录',
    noData: '暂无通讯数据...',
    export: '导出',
    clear: '清空'
  },

  // Data Type
  dataType: {
    label: '类型'
  },

  // Scan Results
  scan: {
    noResults: '暂无扫描结果',
    unitId: '单元 ID',
    coils: '线圈',
    discreteInputs: '离散输入',
    inputRegisters: '输入寄存器',
    holdingRegisters: '保持寄存器',
    error: '错误'
  },

  // Update Banner
  update: {
    title: '新版本可用',
    message: '版本 {{version}} 现已可用。',
    download: '下载最新版本',
    close: '关闭'
  },

  // Snackbar Messages
  snackbar: {
    configOpened: '配置打开成功',
    configOpenedLegacy: '配置打开成功（旧格式），建议保存为新格式。',
    configMigrated: '配置已从旧格式更新',
    invalidConfig: '无效配置',
    invalidJson: '无效的 JSON: {{message}}',
    futureVersion: '此配置是使用较新版本的 Modbux 创建的。某些功能可能无法正常工作。',
    mixedEndianness: '警告：配置具有混合的字节序设置。现已全局使用 {{endian}}。请验证。'
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
  },

  // Endian Explanation
  endian: {
    title: '大端模式 vs 小端模式字节序',
    description:
      '下表展示了32位整数值（305419896，十六进制 0x12345678）的示例，以及它在大端模式和小端模式中如何被分割成16位字。我们还展示了这些字如何被分配到Modbus寄存器，以及SCL（结构化控制语言）赋值语句。',
    table: {
      orderType: '字节序类型',
      register0: '寄存器 0',
      register1: '寄存器 1',
      sclAssignments: 'SCL寄存器赋值'
    },
    bigEndian: '大端模式',
    littleEndian: '小端模式',
    beTitle: '大端模式 (BE)：',
    beDescription:
      '在大端模式中，最高有效字节（MSB）先存储，然后是最低有效字节（LSB）。在Modbus中，这是大多数系统的标准，包括西门子S7等PLC。在这个例子中，32位整数 0x12345678 的存储方式如下：',
    leTitle: '小端模式 (LE)：',
    leDescription:
      '在小端模式中，最低有效字节（LSB）先存储，然后是最高有效字节（MSB）。这种格式在Modbus通信中较少见。在同一个例子中，32位整数 0x12345678 的存储方式如下：',
    wordOrder: '字节顺序',
    sclAssignment: 'SCL赋值',
    explanationTitle: '说明：',
    beExplanation:
      '在大端模式中，高位字（W1）被分配到第一个寄存器，而低位字（W0）被分配到第二个寄存器。',
    leExplanation: '在小端模式中，低位字（W0）先存储，高位字（W1）后存储。',
    conclusion: '在与Modbus设备通信时，了解设备使用哪种字节序对于确保正确的数据解释至关重要。'
  },

  // 图表功能
  chart: {
    showChart: '显示图表',
    hideChart: '隐藏图表',
    configTitle: '图表配置',
    searchPlaceholder: '搜索寄存器...',
    selectedSeries: '已选系列',
    noSeriesSelected: '未选择系列',
    realTimeChart: '实时图表'
  }
}
