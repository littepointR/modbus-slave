export default {
  // Common
  common: {
    save: 'Save',
    load: 'Load',
    clear: 'Clear',
    delete: 'Delete',
    cancel: 'Cancel',
    confirm: 'Confirm',
    add: 'Add',
    edit: 'Edit',
    close: 'Close',
    connect: 'Connect',
    disconnect: 'Disconnect',
    read: 'Read',
    write: 'Write',
    scan: 'Scan',
    stop: 'Stop',
    export: 'Export',
    showLog: 'Show Log',
    hideLog: 'Hide Log',
    settings: 'Settings',
    language: 'Language',
    returnToHome: 'Return to home',
    view: 'View',
    refresh: 'Refresh',
    validate: 'Validate',
    moreOptions: 'More options',
    timeSettings: 'Time settings',
    pollRate: 'Poll Rate',
    timeout: 'Timeout',
    min: 'Min',
    max: 'Max',
    address: 'Address',
    length: 'Length',
    value: 'Value',
    configuration: 'Configuration',
    ok: 'OK',
    error: 'ERROR'
  },

  // Navigation
  nav: {
    client: 'Client',
    server: 'Server',
    split: 'Split'
  },

  // Client Mode
  client: {
    title: 'Modbus Client',
    connection: {
      title: 'Connection',
      protocol: 'Protocol',
      unitId: 'Unit ID',
      host: 'Host',
      port: 'Port',
      comPort: 'COM Port',
      baudRate: 'Baud Rate',
      dataBits: 'Data Bits',
      stopBits: 'Stop Bits',
      parity: 'Parity',
      ipAddress: 'IP Address',
      tcp: 'TCP',
      rtu: 'RTU',
      refreshComPorts: 'Refresh COM ports',
      validateComPort: 'Validate COM port'
    },
    register: {
      title: 'Register Configuration',
      type: 'Register Type',
      address: 'Address',
      length: 'Length',
      pollRate: 'Poll Rate (ms)',
      timeout: 'Timeout (ms)',
      littleEndian: 'Little Endian',
      bigEndian: 'Big Endian',
      advancedMode: 'Advanced Mode',
      readConfiguration: 'Use Configuration',
      addressBase: 'Address Base',
      addressBase0: 'Address base 0',
      addressBase1: 'Address base 1',
      configNamePlaceholder: 'Client Configuration Name'
    },
    actions: {
      startPolling: 'Start Polling',
      stopPolling: 'Stop Polling',
      scanUnitIds: 'Scan Unit IDs',
      scanRegisters: 'Scan Registers',
      readConfigured: 'Read all configured registers',
      readAll: 'Read all registers that have been configured with a data type'
    },
    messages: {
      connected: 'Connected to server',
      disconnected: 'Disconnected from server',
      reconnecting: 'Connection lost, reconnecting...',
      alreadyConnected: 'Already connected',
      alreadyDisconnected: 'Already disconnected',
      cannotRead: 'Cannot read, not connected',
      cannotScanWhilePolling: 'Cannot scan while polling is enabled'
    },
    config: {
      view: 'View configuration',
      viewTooltip: 'view current datatype, scaling and comment configuration',
      save: 'Save configuration',
      saveTooltip: 'save datatype, scaling and comment configuration to json file',
      load: 'Load configuration',
      loadTooltip: 'load a modbux client configuration file',
      clear: 'Clear configuration',
      clearTooltip: 'clear datatype, scaling and comment configuration'
    },
    scan: {
      minUnitId: 'Min Unit ID',
      maxUnitId: 'Max Unit ID',
      minAddress: 'Min Address',
      maxAddress: 'Max Address',
      start: 'Start Scanning',
      stop: 'Stop Scanning'
    },
    options: {
      advancedMode: 'Advanced mode',
      show64bit: 'Show 64 bit values'
    },
    write: {
      addressValue: 'Address {{address}} value',
      fc6: 'FC6: Write single register',
      fc16: 'FC16: Write multiple registers',
      fc5: 'FC5: Write single coils',
      fc15: 'FC15: Write multiple coils',
      writeCoils: 'Write coils'
    },
    grid: {
      interpolation: 'Interpolation'
    }
  },

  // Server Mode
  server: {
    title: 'Modbus Server',
    configuration: 'Server Configuration',
    configPlaceholder: 'Server Name',
    addServer: 'Add Server',
    removeServer: 'Remove Server',
    unitId: 'Unit ID',
    port: 'Port',
    portWithNumber: 'Port {{port}}',
    registers: {
      title: 'Registers',
      addRegister: 'Add Register',
      editRegister: 'Edit Register',
      address: 'Address',
      type: 'Data Type',
      value: 'Value',
      length: 'Length (registers)',
      littleEndian: 'Little Endian',
      bigEndian: 'Big Endian',
      scale: 'Scale Factor',
      comment: 'Comment',
      minValue: 'Min Value',
      maxValue: 'Max Value',
      interval: 'Interval (s)',
      mode: {
        fixed: 'Fixed',
        generator: 'Generator'
      },
      actions: {
        submitChange: 'Submit Change',
        addAndClose: 'Add & Close',
        addAndNext: 'Add & Next',
        remove: 'Remove'
      },
      validation: {
        inUse: 'In use',
        dataTypeDoesNotFit: 'Data type does not fit at this address'
      },
      titles: {
        edit: 'Edit',
        add: 'Add',
        inputRegister: 'Input Register',
        holdingRegister: 'Holding Register'
      }
    },
    booleans: {
      add: 'Add {{type}}',
      deleteAll: 'Delete all {{type}}',
      toggle: 'Toggle {{type}} address {{address}}'
    },
    sections: {
      toggle: 'Toggle {{name}} section'
    },
    dataTypes: {
      int16: 'Int16',
      uint16: 'UInt16',
      int32: 'Int32',
      uint32: 'UInt32',
      int64: 'Int64',
      uint64: 'UInt64',
      float: 'Float',
      double: 'Double',
      unix: 'Unix Timestamp',
      datetime: 'DateTime (IEC 870-5)',
      utf8: 'UTF-8 String',
      bool: 'Boolean'
    },
    messages: {
      serverStarted: 'Server started',
      serverStopped: 'Server stopped',
      portInUse: 'Port is already in use'
    },
    openSaveClear: {
      open: 'Open configuration',
      save: 'Save configuration',
      clear: 'Clear configuration'
    }
  },

  // Transaction Log
  transaction: {
    title: 'Transaction Log',
    timestamp: 'Timestamp',
    unitId: 'ID',
    address: 'Addr',
    function: 'Fn',
    request: 'Request',
    response: 'Response',
    error: 'Error',
    noTransactions: 'No transactions logged yet'
  },

  // Register Types
  registerTypes: {
    coils: 'Coils',
    discrete_inputs: 'Discrete Inputs',
    input_registers: 'Input Registers',
    holding_registers: 'Holding Registers'
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
    unix: 'Unix Timestamp',
    datetime: 'DateTime',
    utf8: 'UTF-8',
    bool: 'Boolean'
  },

  // Error Messages
  errors: {
    connectionFailed: 'Connection failed',
    readFailed: 'Read failed',
    writeFailed: 'Write failed',
    invalidAddress: 'Invalid address',
    invalidValue: 'Invalid value',
    timeout: 'Request timeout',
    unknownError: 'Unknown error'
  },

  // Endian Explanation
  endian: {
    title: 'Big-Endian vs Little-Endian Word Order',
    description: 'The following table shows an example of a 32-bit integer value (305419896, hexadecimal 0x12345678) and how it is split into 16-bit words in both Big-Endian and Little-Endian formats. We also show how these words are assigned to Modbus registers, along with SCL (Structured Control Language) assignments.',
    table: {
      orderType: 'Order Type',
      register0: 'Register 0',
      register1: 'Register 1',
      sclAssignments: 'SCL Register Assignments'
    },
    bigEndian: 'Big-Endian',
    littleEndian: 'Little-Endian',
    beTitle: 'Big-Endian (BE):',
    beDescription: 'In Big-Endian format, the most significant byte (MSB) is stored first, followed by the least significant byte (LSB). In Modbus, this is the standard for most systems, including PLCs like Siemens S7. In the example, the 32-bit integer 0x12345678 is stored as:',
    leTitle: 'Little-Endian (LE):',
    leDescription: 'In Little-Endian format, the least significant byte (LSB) is stored first, followed by the most significant byte (MSB). This format is less common in Modbus communication. In the same example, the 32-bit integer 0x12345678 is stored as:',
    wordOrder: 'Word order',
    sclAssignment: 'SCL assignment',
    explanationTitle: 'Explanation:',
    beExplanation: 'In Big-Endian, the high-order word (W1) is assigned to the first register, while the low-order word (W0) is assigned to the second register.',
    leExplanation: 'In Little-Endian, the low-order word (W0) is stored first, and the high-order word (W1) is stored second.',
    conclusion: 'When communicating with Modbus devices, it\'s essential to know which endianness the device uses to ensure correct data interpretation.'
  }
}
