# 微信支付回调接入说明

## 路径

- Vercel 回调地址：`/api/payment/wechat/notify`
- 生产地址：`https://www.lambertcosine.top/api/payment/wechat/notify`

## 作用

- 接收微信支付 `notify_url` 回调
- 验证微信支付签名
- 解密回调资源
- 将支付结果转发到小程序项目的受信任确认入口

## Vercel 环境变量

```env
WECHAT_PAY_API_V3_KEY=商户平台 APIv3 Key
WECHAT_PAY_PLATFORM_PUBLIC_KEY=微信支付平台公钥 PEM 内容
WECHAT_PAY_PLATFORM_SERIAL=微信支付平台证书序列号
PAYMENT_FORWARD_CONFIRM_URL=小程序项目 payment-notify-forward 的公网地址
PAYMENT_FORWARD_SECRET=与小程序项目 PAYMENT_NOTIFY_FORWARD_SECRET 保持一致
```

## 小程序项目云函数环境变量

```env
PAYMENT_NOTIFY_FORWARD_SECRET=给 Vercel 转发调用的共享密钥
```

## 联调顺序

1. 在 Vercel 配置上述环境变量
2. 部署 `admin-portal`
3. 在小程序项目部署 `payment-notify-forward`
4. 将 `WECHAT_PAY_NOTIFY_URL` 指向 `https://www.lambertcosine.top/api/payment/wechat/notify`
5. 真机发起一笔会员支付，检查订单是否自动变更为已支付
