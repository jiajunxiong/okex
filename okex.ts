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
    orderid, contract_name, contract_type, status, deal_amount, amount, price, price_avg, timestamp
  }
}

const publishOn = (ws: WebSocket) => {
  const handleOrder = (orderAsArray: any) => {
    const order = parseOrder(orderAsArray)

    let er = {
      execId: '',
      orderId: order.orderid,
      symbol: (order.contract_name.substring(0,3).toLowerCase() + "_usd")+ "," + order.contract_type,
      price: order.price,
      quantity: order.amount,
      execQuantity: order.deal_amount,
      execPrice: order.price_avg,
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
    console.log("Connected!")
  }

  exchWs.onmessage = (event: any) => {
    const message: any = JSON.parse(event.data)
    if ("channel" in message[0]) {
      if (message[0].channel === 'ok_sub_futureusd_trades') {
        const orders = message[0].data
        handleOrder(orders)
      }
    }
  }
  const cancel: express.Handler = (req, res) => {
    const api_key = credentials.public
    console.log(req.query.symbol)
    const contract = req.query.symbol.split(',')
    const symbol = contract[0]
    const contract_type = contract[1]
    const order_id = req.query.id
    const ocp = {api_key, symbol, contract_type, order_id}
    const ocs = sign(ocp).query
    const uri = `https://www.okex.com/api/v1/future_cancel.do?${ocs}`
    request({
      uri,
      method: 'POST',
    })
    res.send(JSON.stringify(request))
  }
  app.post('/cancel', cancel)
}

const wss = new WebSocket.Server({ port: wsport })
wss.on('connection', ws => {
  publishOn(ws)
})


app.listen(port, () => {
  console.log(`Listening on ${port}`)
})


