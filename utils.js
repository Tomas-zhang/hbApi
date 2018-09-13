const log4js = require('log4js');

log4js.configure({
    appenders: {
        console: {type: 'console'},
        out: {type: 'stdout'},
        app: {
            type: 'file',
            filename: __dirname + '/logs/market.log',
            maxLogSize: 104857600,
            backups: 10,
            encoding: 'utf-8',
            alwaysIncludePattern: true,
            pattern: "-yyyyMMdd",
        }
    },
    categories: {
        default: {appenders: ['app','console'],level:'info'}
    },
    replaceConsole: true
});
const logger = (name,level)=>{
    let logger = log4js.getLogger(name||'default');
    logger.level = level||'INFO';
    return logger;
};


const sleep = (time) => {
    let start = new Date().getTime();
    // console.log('start:',start);
    while (true){
        let end = new Date().getTime();
        if (end - start > time){
            // console.log('now:',end);
            break;
        }}

};

module.exports = {
    sleep: sleep,
    logger: logger
};