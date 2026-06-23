import crypto from "node:crypto";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequiredEnv(name) {
  const value = normalizeText(process.env[name]);
  if (!value) {
    throw new Error(`${name} 未配置`);
  }

  return value;
}

function normalizePem(value) {
  return normalizeText(value).replace(/\\n/g, "\n");
}

function sendWechatAck(response, statusCode, code, message) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    code,
    message
  }));
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    let length = 0;
    const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB 限制，防止内存耗尽攻击
    const chunks = [];
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > MAX_BODY_SIZE) {
        reject(new Error("Payload Too Large"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function verifyWechatSignature(headers, rawBody) {
  const timestamp = normalizeText(headers["wechatpay-timestamp"]);
  const nonce = normalizeText(headers["wechatpay-nonce"]);
  const signature = normalizeText(headers["wechatpay-signature"]);
  const serial = normalizeText(headers["wechatpay-serial"]);
  const platformPublicKey = normalizePem(getRequiredEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY"));
  const expectedSerial = normalizeText(process.env.WECHAT_PAY_PLATFORM_SERIAL);

  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error("微信支付回调头缺失");
  }

  if (expectedSerial && expectedSerial !== serial) {
    throw new Error("微信支付平台证书序列号不匹配");
  }

  // 验证时间戳，防止重放攻击 (微信官方建议误差不超过 5 分钟)
  const timeOffset = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (timeOffset > 5 * 60) {
    throw new Error("微信支付回调时间戳异常，可能为重放攻击");
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(message);
  const passed = verifier.verify(platformPublicKey, signature, "base64");
  if (!passed) {
    throw new Error("微信支付回调验签失败");
  }
}

function decryptWechatResource(resource) {
  const apiV3Key = getRequiredEnv("WECHAT_PAY_API_V3_KEY");
  const ciphertext = normalizeText(resource?.ciphertext);
  const nonce = normalizeText(resource?.nonce);
  const associatedData = normalizeText(resource?.associated_data);
  if (!ciphertext || !nonce) {
    throw new Error("微信支付回调资源不完整");
  }

  const dataBuffer = Buffer.from(ciphertext, "base64");
  const authTag = dataBuffer.subarray(dataBuffer.length - 16);
  const encryptedData = dataBuffer.subarray(0, dataBuffer.length - 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(nonce, "utf8")
  );
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
  }
  decipher.setAuthTag(authTag);

  const plainText = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plainText);
}

async function forwardPaymentResult(payload) {
  const url = getRequiredEnv("PAYMENT_FORWARD_CONFIRM_URL");
  const secret = getRequiredEnv("PAYMENT_FORWARD_SECRET");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-payment-forward-secret": secret
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(normalizeText(result?.message) || "转发支付确认失败");
  }

  return result;
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      service: "wechat-payment-notify"
    });
    return;
  }

  if (request.method !== "POST") {
    sendWechatAck(response, 405, "FAIL", "Method Not Allowed");
    return;
  }

  try {
    const rawBody = await readRawBody(request);
    verifyWechatSignature(request.headers || {}, rawBody);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const resource = decryptWechatResource(body?.resource || {});

    await forwardPaymentResult({
      orderNo: normalizeText(resource?.out_trade_no),
      tradeState: normalizeText(resource?.trade_state),
      transactionId: normalizeText(resource?.transaction_id),
      successTime: normalizeText(resource?.success_time),
      payload: {
        notifyId: normalizeText(body?.id),
        createTime: normalizeText(body?.create_time),
        eventType: normalizeText(body?.event_type),
        resourceType: normalizeText(body?.resource_type),
        summary: normalizeText(body?.summary),
        resource
      }
    });

    sendWechatAck(response, 200, "SUCCESS", "成功");
  } catch (error) {
    console.error("[wechat-payment-notify]", error);
    // 安全要求：不要向外暴露内部报错的详细信息，防止信息泄露
    sendWechatAck(response, 500, "FAIL", "回调处理失败");
  }
}
