module.exports = Object.freeze({
    HUOBI_WS_URI: 'wss://api.huobi.br.com/ws',// 国内测试用
    PERIODS: ['1min', '5min', '15min', '30min', '60min', '4hour', '1day', '1mon', '1week', '1year'],
    TYPES: ['step0', 'step1', 'step2', 'step3', 'step4', 'step5', 'percent10'],
    KEYPATH: process.cwd()+'/pem/key.pem',
    CERTPATH: process.cwd()+'/pem/server.crt',
    REDIS_URI: 'redis://127.0.0.1:6379',
    EXCHANGE: ['huoBi', 'biAn']
});
