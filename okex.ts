import * as CryptoJS from 'crypto-js'
import * as request from 'request-promise-native'
import * as moment from 'moment'
import * as _ from 'lodash'
import * as express from 'express'
import * as WebSocket from 'ws'
import * as config from 'config'
import * as https from 'https'
import { json } from 'body-parser';


const port = config.get('port')
const wsport: number = config.get('wsport')
const credentials: {
  public: string,
  secret: string
} = config.get('credentials')

const app = express()

const sign = (parameters: any) => {
  const ps = _.assign({}, parameters, {api_key: credentials.public})
  const ks = _.orderBy(_.keys(ps))
  const a0 = _.map(ks, (k: string) => `${k}=${encodeURIComponent(ps[k])}`)
  const a1 = a0.join('&')
  const a2 = `${a1}&secret_key=${credentials.secret}`
  const sig = CryptoJS.MD5(a2).toString(CryptoJS.enc.Hex).toUpperCase()
  const a3 = `${a1}&sign=${sig}`
  return {
    query: a3,
    sig
  }
}


enum sts {
  "active" = 0,
  "partially filled" = 1,
  "filled" = 2,
  "pending cancel" = 4,
  "cancelled" = -1,
}

const parseOrder = (order: any) => {
  const {lever_rate, amount, orderid, contract_id, fee, contract_name, unit_amount, price_avg, type, deal_amount, contract_type, user_id, system_type, price, create_date_str, create_date, status} = order
  const timestamp = moment(create_date_str)
  return {
    orderid, contract_name, status, deal_amount, amount, price, price_avg, timestamp
  }
}

const publishOn = (ws: WebSocket) => {
  const handleOrder = (orderAsArray: any) => {
    const order = parseOrder(orderAsArray)

    let er = {
      execId: '',
      orderId: order.orderid,
      symbol: order.contract_name,
      price: order.price,
      quantity: order.deal_amount,
      cumExecQuantity: order.deal_amount += order.deal_amount,
      cumExecPrice: order.price_avg,
      status: sts[order.status],
      timestamp: order.timestamp.unix()
    }
    er.execId = CryptoJS.SHA1(JSON.stringify(er)).toString(CryptoJS.enc.Hex)
    console.log(er)
    ws.send(JSON.stringify(er))
  }

  const exchWs = new WebSocket('wss://real.okex.com:10440/websocket/okexapi')
  exchWs.onopen = () => {
    const parameters = sign({})
    const login = {
      event: 'login',
      parameters: {
        api_key: credentials.public,
        sign: parameters.sig
      }
    }
    const m = JSON.stringify(login)
    exchWs.send(m)
    console.log(sign({}).sig)
    console.log("Connected!")
  }

  exchWs.onmessage = (event: any) => {
    const message: any = JSON.parse(event.data)
    if ("channel" in message[0]) {
      if (message[0].channel === 'ok_sub_futureusd_trades') {
        const orders = message[0].data
        switch(message[0].data.status) {
            case 0:
              handleOrder(orders)
              break
            case 1:
              handleOrder(orders)
              break
            case 2:
              handleOrder(orders)
              break
            case 4:
              handleOrder(orders)
              break
            case -1:
              handleOrder(orders)
              break
            default: console.log(`Listening on ${wsport}`)
        }
      }
    }
  }
  const cancel: express.Handler = async (req, res) => {
    console.log('cancel')
    const api_key = credentials.public
    const symbol = "btc_usd"
    const contract_type = "next_week"
    console.log(typeof(req.query.id))
    const order_id = req.query.id
    console.log(order_id)
    const ocp = {api_key, symbol, contract_type, order_id}
    const ocs = sign(ocp).query
    const uri = `https://www.okex.com/api/v1/future_cancel.do?${ocs}`
    console.log(uri)
    const s = await request({
      uri,
      method: 'POST',
    })
    console.log(JSON.stringify(s))
    exchWs.send(s)
  }
  app.post('/cancel', oc)
}

const wss = new WebSocket.Server({ port: wsport })
wss.on('connection', ws => {
  publishOn(ws)
})


/*
const m = sign({}).query
const f = async () => {
  const uri = `https://www.okex.com/api/v1/future_userinfo.do?${m}`
  console.log(uri)
  const rep = await request({
    uri,
    method: 'POST',
  })
  console.log(rep)
}
f()
*/


const api_key = credentials.public
const symbol = "btc_usd"
const contract_type = "next_week"
//const order_id = "688886532021248"
//const ocp = {api_key, symbol, contract_type, order_id}
//const ocs = sign(ocp).query
const oc: express.Handler = async (req, res) => {
  const order_id = req.query.id
  const ocp = {api_key, symbol, contract_type, order_id}
  const ocs = sign(ocp).query
  const uri = `https://www.okex.com/api/v1/future_cancel.do?${ocs}`
  console.log(uri)
  const s = await request({
    uri,
    method: 'POST',
  })
  console.log(s)
}


const price = '1000'
const amount = '1'
const type = '1'
const onp = {api_key, symbol, contract_type, price, amount, type}
const ons = sign(onp).query
const on = async () => {
  const uri = `https://www.okex.com/api/v1/future_trade.do?${ons}`
  console.log(uri)
  const req = await request ({
    uri,
    method: 'POST'
  })
  console.log(req)
}

app.post('/cancel', oc)
app.post('/new', on)

app.listen(port, () => {
  console.log(`Listening on ${port}`)
})

