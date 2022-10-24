import CartDetail from '../models/cart-detail.js'
import vnPayParams from '../../util/vnPayParams.js'
import dateFormat, { masks } from "dateformat";
import sortObject from 'sort-object';
import querystring from 'qs';
import * as crypto from 'crypto';

class CartController {
    // [GET] /cart
    async cart(req, res, next) {
        const user = req.session.user || req.user
        try {
            const cartDetails = await CartDetail.findAll({ where: { userId: user.id }, include: ['book'] })
            return res.render('guest/cart/cart', { layout: null, cartDetails })
        } catch (error) {
            next(error)
        }
    }

    // [POST] /cart?replace&bookId=&quantity=?
    async addToCart(req, res, next) {
        const user = req.session.user || req.user
        const quantity = req.body?.quantity || 1
        try {
            if (req.query.hasOwnProperty('replace')) {
                await CartDetail.update({ quantity: quantity }, { where: { id: req.body.id } })
            }
            else {
                const item = await CartDetail.findOne({ where: { userId: user.id, quantity: quantity } })
                if (item) {
                    const item = await CartDetail.findOne({ where: { userId: user.id, bookId: req.body.bookId } })
                    item.quantity += parseInt(quantity)
                    await item.save()
                } else {
                    await CartDetail.create({ userId: user.id, bookId: req.body.bookId, quantity })
                }
            }

            return res.json({ success: true, message: 'Cart updated' })
        } catch (error) {
            next(error)
        }
    }

    // [DELETE] /cart
    async deleteCartItem(req, res, next) {
        try {
            const item = await CartDetail.findByPk(req.query.id)
            await item.destroy()
            return res.json({ success: true, message: 'Deleted' })
        } catch (error) {
            next(error)
        }
    }

    // [GET] /cart/checkout
    async checkoutForm(req, res, next) {
        const user = req.session.user || req.user
        try {
            const cartItems = await CartDetail.findAll({ where: { userId: user.id } })
            return res.render('cart/cart', { cartItems })
        } catch (error) {
            next(error)
        }
    }

    async showPaymentForm(req, res, next) {
        const user = req.session.user || req.user
        try {
            return res.render('guest/cart/payment')
        } catch (error) {
            next(error)
        }
    }

    async processPayment(req, res, next) {
        var ipAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;
            
        var tmnCode = vnPayParams.vnp_TmnCode;
        var secretKey = vnPayParams.vnp_HashSecret;
        var vnpUrl = vnPayParams.vnp_Url;
        var returnUrl = vnPayParams.vnp_Returnurl;

        var date = new Date();

        var createDate = dateFormat(date, 'yyyymmddHHmmss');
        var orderId = dateFormat(date, 'HHmmss');
        console.log("Check req.body: ", req.body);
        var amount = req.body.amount;
        var bankCode = req.body.bank_code;
        
        var orderInfo = req.body.order_desc;
        var orderType = req.body.order_type;
        var locale = req.body.language;
        if (locale === null || locale === '') {
            locale = 'vn';
        }
        var currCode = 'VND';
        var vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.0.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        // vnp_Params['vnp_Merchant'] = ''
        vnp_Params['vnp_Locale'] = locale;
        vnp_Params['vnp_CurrCode'] = currCode;
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = orderInfo;
        vnp_Params['vnp_OrderType'] = orderType;
        vnp_Params['vnp_Amount'] = amount * 100;
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_CreateDate'] = createDate;
        
        if (bankCode !== null && bankCode !== '') {
            vnp_Params['vnp_BankCode'] = bankCode;
        }

        vnp_Params = sortObject(vnp_Params);
        console.log(JSON.stringify(vnp_Params));
        var signData = querystring.stringify(vnp_Params, { encode: false });
        var hmac = crypto.createHmac("sha512", secretKey);
        var signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");
        vnp_Params['vnp_SecureHash'] = signed;
        vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

        res.redirect(vnpUrl)
    }

    async paymentIPN (req, res, next) {
        var vnp_Params = req.query;
        var secureHash = vnp_Params['vnp_SecureHash'];
    
        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];
    
        vnp_Params = sortObject(vnp_Params);
        // var config = require('config');
        var secretKey = vnPayParams.vnp_HashSecret;
        var querystring = require('qs');
        var signData = querystring.stringify(vnp_Params, { encode: false });
        var crypto = require("crypto");     
        var hmac = crypto.createHmac("sha512", secretKey);
        var signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");     
         
    
        if(secureHash === signed){
            var orderId = vnp_Params['vnp_TxnRef'];
            var rspCode = vnp_Params['vnp_ResponseCode'];
            //Kiem tra du lieu co hop le khong, cap nhat trang thai don hang va gui ket qua cho VNPAY theo dinh dang duoi
            res.status(200).json({RspCode: '00', Message: 'success'})
        }
        else {
            res.status(200).json({RspCode: '97', Message: 'Fail checksum'})
        }
    }
}

export default new CartController