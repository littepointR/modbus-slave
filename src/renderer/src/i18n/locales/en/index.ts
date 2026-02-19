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
    language: 'Language'
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
      parity: 'Parity'
    },
    register: {
      title: 'Register Configuration',
      type: 'Register Type',
      address: 'Address',
      length: 'Length',
      pollRate: 'Poll Rate (ms)',
      timeout: 'Timeout (ms)',
      littleEndian: 'Little Endian',
      advancedMode: 'Advanced Mode',
      readConfiguration: 'Use Configuration',
      addressBase: 'Address Base'
    },
    actions: {
      startPolling: 'Start Polling',
      stopPolling: 'Stop Polling',
      scanUnitIds: 'Scan Unit IDs',
      scanRegisters: 'Scan Registers'
    },
    messages: {
      connected: 'Connected to server',
      disconnected: 'Disconnected from server',
      reconnecting: 'Connection lost, reconnecting...',
      alreadyConnected: 'Already connected',
      alreadyDisconnected: 'Already disconnected',
      cannotRead: 'Cannot read, not connected',
      cannotScanWhilePolling: 'Cannot scan while polling is enabled'
    }
  },

  // Server Mode
  server: {
    title: 'Modbus Server',
    configuration: 'Server Configuration',
    addServer: 'Add Server',
    removeServer: 'Remove Server',
    unitId: 'Unit ID',
    port: 'Port',
    registers: {
      title: 'Registers',
      addRegister: 'Add Register',
      editRegister: 'Edit Register',
      address: 'Address',
      type: 'Data Type',
      value: 'Value',
      length: 'Length (registers)',
      littleEndian: 'Little Endian',
      scale: 'Scale Factor',
      comment: 'Comment'
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
  }
}
