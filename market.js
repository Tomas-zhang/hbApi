const WebSocket = require('ws');
const redis = require('redis');
const pako = require('pako');
const consts = require('./consts');
const utils = require('./utils');
const logger = utils.logger('market');

const client = redis.createClient(consts.REDIS_URI, {db: 3});
const periods = consts.PERIODS;
let symbols = [],hasReqSymbol = [];

const wsObj = {};
wsObj.init = (uri) =>{
    symbols = [];
    hasReqSymbol = [];
    const ws = new WebSocket(uri);
    ws.on('open',()=>{
        logger.info('connected to HuoBi Server');
        client.smembers('symbols', cbSymbol);
        ws.send(JSON.stringify({
            'sub': `market.tickers`,
            'id': `market-tickers`
        }));
    });
    ws.on('close',(code)=>{
        logger.info('ws断开与火币服务器连接,断开code: ',code);
        reConnect();
    });
    ws.on('error',(err)=>{
        throw err;
    });
    ws.on('message', (data)=>{
        let text = pako.inflate(data, {to: 'string'});
        let msg = JSON.parse(text);
        if (msg.ping) {
            logger.info('send pong=',msg.ping);
            ws.send(JSON.stringify({'pong': msg.ping}));
            logger.debug('symbols.len=',symbols.length);
            if (symbols.length !== 0) {
                for (let symbol of symbols) {
                    if (hasReqSymbol.indexOf(symbol) === -1) {
                        for (let p of periods) {
                            ws.send(JSON.stringify({
                                'req': `market.${symbol}.kline.${p}`,
                                'id': `req-${symbol}-kline-${p}`
                            }));
                            ws.send(JSON.stringify({
                                'sub': `market.${symbol}.kline.${p}`,
                                'id': `sub-${symbol}-kline-${p}`
                            }));
                        }
                        ws.send(JSON.stringify({
                            'sub': `market.${symbol}.depth.step0`,
                            'id': `sub-${symbol}-depth`
                        }));
                        ws.send(JSON.stringify({
                            'req': `market.${symbol}.trade.detail`,
                            'id': `req-${symbol}-trade`
                        }));
                        ws.send(JSON.stringify({
                            'sub': `market.${symbol}.trade.detail`,
                            'id': `sub-${symbol}-trade`
                        }));
                        ws.send(JSON.stringify({
                            'sub': `market.${symbol}.detail`,
                            'id': `sub-${symbol}-24h-detail`
                        }));
                        hasReqSymbol.push(symbol);
                        break;
                    }
                }
            }
        } else if (msg.subbed) {
            logger.debug('subbed information: ' + text);
        } else if (msg.ch == 'market.tickers') {
            logger.debug('handle market.tickers and symbols');
            _getSymbol(msg);
        } else if (msg.data) {
            // logger.info('handle request');
            _initReq(msg);
        } else if (msg.tick) {
            // logger.info('handle subscribe');
            _handleMsg(msg);
        } else {
            logger.error('wsError: ' + text);
        }
    });

};

const reConnect = ()=>{
    logger.info('socket 断开，正在尝试连接');
    wsObj.init(consts.HUOBI_WS_URI);
};


const _getSymbol = (msg)=>{
    if (msg.ch == 'market.tickers') {
        let _key = 'huoBi:MarketTickers';
        client.set(_key, JSON.stringify({'tick': msg.data}), cb);

        //解析交易对并保存
        for (let i of msg.data) {
            for (let k in i) {
                if (k === 'symbol') {
                    if (symbols.indexOf(i[k]) === -1 && !i[k].startsWith('hb') && !i[k].startsWith('huobi')) {
                        symbols.push(i[k]);
                        client.sadd('symbols', i[k], (err,rep)=>{
                            if (err){throw err}
                            logger.debug('add symbol number:',rep);
                        });
                    }
                }
            }
        }
    }
};

const _initReq = (msg) =>{
    let [, symbol, channel] = msg.rep.split('.');
    let key = 'huoBi:' + symbol;
    switch (channel) {
        case 'kline':
            key += ':kline:' + msg.rep.split('.')[3];
            client.llen(key,(err,rep)=>{
                if (err){throw err}
                if (rep === 0){
                    //首次运行保存最初订阅数据
                    for (let i of msg.data){
                        client.lpush(key,JSON.stringify(i), cb);
                    }
                }else{
                    client.lrange(key,0,0,(e,d)=>{
                        if (e){throw e}
                        d = JSON.parse(d);

                        if (msg.data[0].id == d.id){
                            client.lpop(key,cb);
                            for (let i of msg.data){
                                client.lpush(key,JSON.stringify(i), cb);
                            }
                            // msg.data[0].id: 新订阅的最旧时间戳
                            // d.id: 已保存数据的最近时间戳
                            // 新订阅数据与保存数据有重复
                        }else if(msg.data[0].id < d.id){
                            for (let i of msg.data){
                                if (i.id > d.id){
                                    client.lpush(key,JSON.stringify(i), cb);
                                }
                            }
                        }else if(msg.data[0].id > d.id){
                            client.del(key,cb);
                            for (let i of msg.data){
                                client.lpush(key,JSON.stringify(i), cb);
                            }
                        }
                    });
                }
            });
            break;
        case 'trade':
            key += ':trade:req:detail';
            for (let i of msg.data.reverse()){
                client.lpush(key,JSON.stringify(i),cb);
            }
            break;
    }
};
const _handleMsg = (msg) => {
    let [, symbol, channel] = msg.ch.split('.');
    let key = 'huoBi:' + symbol;
    switch (channel) {
        case 'depth':
            let depthData = msg.tick;
            key += ':depth:step0';
            client.set(key, JSON.stringify(depthData), cb);
            break;
        case 'trade':
            key += ':trade:sub:detail';
            client.lpush(key,JSON.stringify(msg.tick),cb);
            break;
        case 'detail':
            key += ':detail';
            client.lpush(key, JSON.stringify(msg.tick), cb);
            client.ltrim(key,0,299);
            break;
        case 'kline':
            key += ':kline:' + msg.ch.split('.')[3];
            let subData = msg.tick;
            client.lrange(key,0,0,(err,data)=>{
                if (err){throw err}
                if (data.length !== 0 ){
                    data = JSON.parse(data);
                    if (data.id === subData.id){
                        client.lpop(key,(e,d)=>{
                            if(e){throw e}
                            logger.debug('lpop:',d);
                        });
                    }
                    client.lpush(key,JSON.stringify(subData), cb);
                }
            });
            break;
    }
};

const cb = (err, data) => {
    if (err){throw err}
    logger.debug('callback data:', data);
};
const cbSymbol = (err, data) => {
    if (err){throw err}
    if (data.length !== 0){
        for (let i in data){
            symbols.push(data[i]);
        }
    }
};

wsObj.init(consts.HUOBI_WS_URI);