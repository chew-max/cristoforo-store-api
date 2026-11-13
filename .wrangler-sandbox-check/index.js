var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/config/store.js
var DEFAULT_STORE_CONFIG = {
  name: "Jekyll Commerce",
  currency: "USD",
  storefrontOrigin: "https://chew-max.github.io",
  storefrontBasePath: "/jekyll-commerce-starter",
  successUrl: "https://chew-max.github.io/jekyll-commerce-starter/checkout/success/",
  failedUrl: "https://chew-max.github.io/jekyll-commerce-starter/checkout/failed",
  paymentReturnUrl: "https://jekyll-commerce-api.mth-commerce.workers.dev/api/payment-return",
  maxQuantity: 10,
  fulfillmentProvider: "printify",
  emailProvider: "resend",
  emailFrom: "Jekyll Commerce <onboarding@resend.dev>"
};
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(
    String(value ?? ""),
    10
  );
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}
__name(positiveInteger, "positiveInteger");
function getStoreConfig(env = {}) {
  return {
    name: env.STORE_NAME || DEFAULT_STORE_CONFIG.name,
    currency: env.STORE_CURRENCY || DEFAULT_STORE_CONFIG.currency,
    storefrontOrigin: env.STOREFRONT_ORIGIN || DEFAULT_STORE_CONFIG.storefrontOrigin,
    storefrontBasePath: env.STOREFRONT_BASE_PATH || DEFAULT_STORE_CONFIG.storefrontBasePath,
    successUrl: env.STORE_SUCCESS_URL || DEFAULT_STORE_CONFIG.successUrl,
    failedUrl: env.STORE_FAILED_URL || DEFAULT_STORE_CONFIG.failedUrl,
    paymentReturnUrl: env.PAYMENT_RETURN_URL || DEFAULT_STORE_CONFIG.paymentReturnUrl,
    maxQuantity: positiveInteger(
      env.STORE_MAX_QUANTITY,
      DEFAULT_STORE_CONFIG.maxQuantity
    ),
    fulfillmentProvider: env.FULFILLMENT_PROVIDER || DEFAULT_STORE_CONFIG.fulfillmentProvider,
    emailProvider: env.EMAIL_PROVIDER || DEFAULT_STORE_CONFIG.emailProvider,
    emailFrom: env.STORE_EMAIL_FROM || DEFAULT_STORE_CONFIG.emailFrom
  };
}
__name(getStoreConfig, "getStoreConfig");

// src/email/resend.js
async function sendWithResend(env, message, options = {}) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "EMAIL SEND SUPPRESSED",
      {
        environment: "sandbox",
        subject: message?.subject || null
      }
    );
    return {
      id: null,
      suppressed: true
    };
  }
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not configured"
    );
  }
  if (!message?.from) {
    throw new Error(
      "Email sender is not configured"
    );
  }
  const payload = {
    from: message.from,
    to: Array.isArray(
      message.to
    ) ? message.to : [message.to],
    subject: message.subject,
    html: message.html
  };
  if (message.text) {
    payload.text = message.text;
  }
  const headers = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json"
  };
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        payload
      )
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${response.status} ${data?.message || JSON.stringify(data)}`
    );
  }
  return data;
}
__name(sendWithResend, "sendWithResend");

// src/email/providers.js
function getEmailProvider(env) {
  const storeConfig = getStoreConfig(env);
  const provider = storeConfig.emailProvider;
  switch (provider) {
    case "resend":
      return {
        send(message, options) {
          return sendWithResend(
            env,
            message,
            options
          );
        }
      };
    default:
      throw new Error(
        `Unsupported email provider: ${provider}`
      );
  }
}
__name(getEmailProvider, "getEmailProvider");

// src/email/index.js
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml, "escapeHtml");
function formatMoney(cents, currency = "USD") {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency
    }
  ).format(
    (Number(cents) || 0) / 100
  );
}
__name(formatMoney, "formatMoney");
function formatOptionLabel(key) {
  return String(key || "").replace(
    /[_-]+/g,
    " "
  ).replace(
    /\b\w/g,
    (character) => character.toUpperCase()
  );
}
__name(formatOptionLabel, "formatOptionLabel");
function getItemOptions(item) {
  if (item.options && Object.keys(
    item.options
  ).length > 0) {
    return item.options;
  }
  const options = {};
  if (item.color) {
    options.color = item.color;
  }
  if (item.size) {
    options.size = item.size;
  }
  return options;
}
__name(getItemOptions, "getItemOptions");
function buildOptionText(options = {}) {
  return Object.entries(
    options
  ).filter(
    ([, value]) => value !== null && value !== void 0 && value !== ""
  ).map(
    ([key, value]) => `${formatOptionLabel(
      key
    )}: ${value}`
  ).join(" / ");
}
__name(buildOptionText, "buildOptionText");
function buildShippingAddressHtml(order) {
  const cityStatePostal = [
    order.shipping_city,
    order.shipping_state
  ].filter(Boolean).join(", ");
  const locality = [
    cityStatePostal,
    order.shipping_postal_code
  ].filter(Boolean).join(" ");
  return [
    order.customer_name,
    order.shipping_address1,
    order.shipping_address2,
    locality,
    order.shipping_country
  ].filter(Boolean).map(escapeHtml).join("<br>");
}
__name(buildShippingAddressHtml, "buildShippingAddressHtml");
function buildShippingAddressText(order) {
  const cityStatePostal = [
    order.shipping_city,
    order.shipping_state
  ].filter(Boolean).join(", ");
  const locality = [
    cityStatePostal,
    order.shipping_postal_code
  ].filter(Boolean).join(" ");
  return [
    order.customer_name,
    order.shipping_address1,
    order.shipping_address2,
    locality,
    order.shipping_country
  ].filter(Boolean).join("\n");
}
__name(buildShippingAddressText, "buildShippingAddressText");
function buildButton(url, label) {
  if (!url) {
    return "";
  }
  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      style="
        margin:28px auto;
      "
    >
      <tr>
        <td
          align="center"
          style="
            border-radius:8px;
            background:#111827;
          "
        >
          <a
            href="${escapeHtml(
    url
  )}"
            style="
              display:inline-block;
              padding:14px 24px;
              color:#ffffff;
              text-decoration:none;
              font-size:15px;
              font-weight:700;
              line-height:1.2;
              border-radius:8px;
            "
          >
            ${escapeHtml(
    label
  )}
          </a>
        </td>
      </tr>
    </table>
  `;
}
__name(buildButton, "buildButton");
function buildEmailShell({
  storeName,
  eyebrow,
  title,
  intro,
  content,
  footerText
}) {
  return `
<!doctype html>
<html>
  <head>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    >
    <meta
      http-equiv="Content-Type"
      content="text/html; charset=UTF-8"
    >
  </head>

  <body
    style="
      margin:0;
      padding:0;
      background:#f3f4f6;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      color:#111827;
    "
  >
    <div
      style="
        display:none;
        max-height:0;
        overflow:hidden;
        opacity:0;
      "
    >
      ${escapeHtml(intro)}
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        background:#f3f4f6;
      "
    >
      <tr>
        <td
          align="center"
          style="
            padding:32px 16px;
          "
        >
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            role="presentation"
            style="
              width:100%;
              max-width:620px;
            "
          >
            <tr>
              <td
                align="center"
                style="
                  padding:0 16px 20px;
                  font-size:20px;
                  line-height:1.3;
                  font-weight:800;
                  color:#111827;
                "
              >
                ${escapeHtml(
    storeName
  )}
              </td>
            </tr>

            <tr>
              <td
                style="
                  background:#ffffff;
                  border-radius:14px;
                  overflow:hidden;
                  box-shadow:
                    0 1px 3px
                    rgba(0,0,0,0.06);
                "
              >
                <div
                  style="
                    height:5px;
                    background:#111827;
                    line-height:5px;
                    font-size:5px;
                  "
                >
                  &nbsp;
                </div>

                <div
                  style="
                    padding:36px 32px;
                  "
                >
                  ${eyebrow ? `
                        <div
                          style="
                            margin:0 0 10px;
                            font-size:12px;
                            line-height:1.4;
                            font-weight:700;
                            letter-spacing:1.2px;
                            text-transform:uppercase;
                            color:#6b7280;
                          "
                        >
                          ${escapeHtml(
    eyebrow
  )}
                        </div>
                      ` : ""}

                  <h1
                    style="
                      margin:0 0 12px;
                      font-size:28px;
                      line-height:1.25;
                      color:#111827;
                    "
                  >
                    ${escapeHtml(
    title
  )}
                  </h1>

                  <p
                    style="
                      margin:0 0 28px;
                      font-size:16px;
                      line-height:1.65;
                      color:#4b5563;
                    "
                  >
                    ${escapeHtml(
    intro
  )}
                  </p>

                  ${content}
                </div>
              </td>
            </tr>

            <tr>
              <td
                align="center"
                style="
                  padding:20px 24px 0;
                  font-size:12px;
                  line-height:1.6;
                  color:#6b7280;
                "
              >
                ${escapeHtml(
    footerText
  )}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}
__name(buildEmailShell, "buildEmailShell");
function buildOrderItemsHtml(items = [], currency = "USD") {
  return items.map(
    (item) => {
      const options = getItemOptions(
        item
      );
      const details = buildOptionText(
        options
      );
      const quantity = Number(
        item.quantity
      ) || 0;
      const unitPrice = Number(
        item.unit_price
      ) || 0;
      return `
          <tr>
            <td
              style="
                padding:16px 0;
                border-bottom:
                  1px solid #e5e7eb;
                vertical-align:top;
              "
            >
              <div
                style="
                  font-size:15px;
                  line-height:1.4;
                  font-weight:700;
                  color:#111827;
                "
              >
                ${escapeHtml(
        item.product_name
      )}
              </div>

              ${details ? `
                    <div
                      style="
                        margin-top:4px;
                        font-size:13px;
                        line-height:1.5;
                        color:#6b7280;
                      "
                    >
                      ${escapeHtml(
        details
      )}
                    </div>
                  ` : ""}

              <div
                style="
                  margin-top:4px;
                  font-size:13px;
                  color:#6b7280;
                "
              >
                Qty:
                ${escapeHtml(
        quantity
      )}
              </div>
            </td>

            <td
              align="right"
              style="
                padding:16px 0 16px 16px;
                border-bottom:
                  1px solid #e5e7eb;
                vertical-align:top;
                white-space:nowrap;
                font-size:15px;
                font-weight:600;
                color:#111827;
              "
            >
              ${formatMoney(
        unitPrice * quantity,
        currency
      )}
            </td>
          </tr>
        `;
    }
  ).join("");
}
__name(buildOrderItemsHtml, "buildOrderItemsHtml");
function buildOrderItemsText(items = [], currency = "USD") {
  return items.map(
    (item) => {
      const options = buildOptionText(
        getItemOptions(
          item
        )
      );
      const quantity = Number(
        item.quantity
      ) || 0;
      const unitPrice = Number(
        item.unit_price
      ) || 0;
      const parts = [
        item.product_name,
        options || null,
        `Qty: ${quantity}`,
        formatMoney(
          unitPrice * quantity,
          currency
        )
      ].filter(Boolean);
      return parts.join(
        " | "
      );
    }
  ).join("\n");
}
__name(buildOrderItemsText, "buildOrderItemsText");
function orderConfirmationTemplate(order, items, config) {
  const storeName = config.storeName;
  const currency = order.currency || "USD";
  const subtotal = order.merchandise_subtotal ?? order.subtotal ?? 0;
  const shipping = order.shipping_amount || 0;
  const tax = order.tax_amount || 0;
  const total = order.total ?? subtotal + shipping + tax;
  const statusUrl = order.customer_status_token && config.orderStatusUrl ? `${config.orderStatusUrl}?token=${encodeURIComponent(
    order.customer_status_token
  )}` : null;
  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:16px 18px;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:5px;
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.7px;
          color:#6b7280;
        "
      >
        Order reference
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
          color:#111827;
        "
      >
        ${escapeHtml(
    order.order_reference
  )}
      </div>
    </div>

    ${buildButton(
    statusUrl,
    "View Order Status"
  )}

    <div
      style="
        margin-top:30px;
      "
    >
      <h2
        style="
          margin:0 0 6px;
          font-size:18px;
          color:#111827;
        "
      >
        Order summary
      </h2>

      <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        role="presentation"
      >
        ${buildOrderItemsHtml(
    items,
    currency
  )}
      </table>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        margin-top:22px;
      "
    >
      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Merchandise
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
    subtotal,
    currency
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Shipping
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
    shipping,
    currency
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Tax
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
    tax,
    currency
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding-top:14px;
            border-top:
              1px solid #e5e7eb;
            font-size:18px;
            font-weight:800;
          "
        >
          Total
        </td>

        <td
          align="right"
          style="
            padding-top:14px;
            border-top:
              1px solid #e5e7eb;
            font-size:18px;
            font-weight:800;
          "
        >
          ${formatMoney(
    total,
    currency
  )}
        </td>
      </tr>
    </table>

    <div
      style="
        margin-top:30px;
        padding-top:24px;
        border-top:
          1px solid #e5e7eb;
      "
    >
      <h2
        style="
          margin:0 0 10px;
          font-size:16px;
          color:#111827;
        "
      >
        Shipping to
      </h2>

      <div
        style="
          font-size:14px;
          line-height:1.7;
          color:#4b5563;
        "
      >
        ${buildShippingAddressHtml(
    order
  )}
      </div>
    </div>
  `;
  return buildEmailShell({
    storeName,
    eyebrow: "Order confirmed",
    title: "Thanks for your order",
    intro: "Your payment was received successfully. We'll send you another email when your order ships.",
    content,
    footerText: `This order confirmation was sent by ${storeName}.`
  });
}
__name(orderConfirmationTemplate, "orderConfirmationTemplate");
function orderConfirmationText(order, items, config) {
  const currency = order.currency || "USD";
  const subtotal = order.merchandise_subtotal ?? order.subtotal ?? 0;
  const shipping = order.shipping_amount || 0;
  const tax = order.tax_amount || 0;
  const total = order.total ?? subtotal + shipping + tax;
  const statusUrl = order.customer_status_token && config.orderStatusUrl ? `${config.orderStatusUrl}?token=${encodeURIComponent(
    order.customer_status_token
  )}` : null;
  return [
    config.storeName,
    "",
    "Thanks for your order.",
    "Your payment was received successfully.",
    "",
    `Order: ${order.order_reference}`,
    "",
    "ORDER SUMMARY",
    buildOrderItemsText(
      items,
      currency
    ),
    "",
    `Merchandise: ${formatMoney(
      subtotal,
      currency
    )}`,
    `Shipping: ${formatMoney(
      shipping,
      currency
    )}`,
    `Tax: ${formatMoney(
      tax,
      currency
    )}`,
    `Total: ${formatMoney(
      total,
      currency
    )}`,
    "",
    "SHIPPING TO",
    buildShippingAddressText(
      order
    ),
    statusUrl ? "" : null,
    statusUrl ? `View order status: ${statusUrl}` : null
  ].filter(
    (value) => value !== null
  ).join("\n");
}
__name(orderConfirmationText, "orderConfirmationText");
async function sendOrderConfirmation(env, order, items) {
  if (!order?.email) {
    throw new Error(
      "Cannot send order confirmation without customer email"
    );
  }
  const provider = getEmailProvider(env);
  const storeConfig = getStoreConfig(env);
  const config = {
    storeName: storeConfig.name,
    from: storeConfig.emailFrom,
    orderStatusUrl: `${storeConfig.storefrontOrigin}${storeConfig.storefrontBasePath}/order-status/`
  };
  const message = {
    from: config.from,
    to: order.email,
    subject: `Order confirmed - ${order.order_reference}`,
    html: orderConfirmationTemplate(
      order,
      items,
      config
    ),
    text: orderConfirmationText(
      order,
      items,
      config
    )
  };
  return provider.send(
    message,
    {
      idempotencyKey: `order-confirmation/${order.order_reference}`
    }
  );
}
__name(sendOrderConfirmation, "sendOrderConfirmation");
function shippingConfirmationTemplate(order, config) {
  const storeName = config.storeName;
  const carrier = order.carrier || "Shipping carrier";
  const trackingNumber = order.tracking_number || "";
  const trackingUrl = order.tracking_url || "";
  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:16px 18px;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:5px;
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.7px;
          color:#6b7280;
        "
      >
        Order reference
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
        "
      >
        ${escapeHtml(
    order.order_reference
  )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
    >
      <tr>
        <td
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            color:#6b7280;
          "
        >
          Carrier
        </td>

        <td
          align="right"
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            font-weight:700;
          "
        >
          ${escapeHtml(
    carrier
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            color:#6b7280;
          "
        >
          Tracking number
        </td>

        <td
          align="right"
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            font-weight:700;
          "
        >
          ${escapeHtml(
    trackingNumber
  )}
        </td>
      </tr>
    </table>

    ${buildButton(
    trackingUrl,
    "Track Your Package"
  )}

    <div
      style="
        margin-top:30px;
        padding-top:24px;
        border-top:
          1px solid #e5e7eb;
      "
    >
      <h2
        style="
          margin:0 0 10px;
          font-size:16px;
        "
      >
        Shipping to
      </h2>

      <div
        style="
          font-size:14px;
          line-height:1.7;
          color:#4b5563;
        "
      >
        ${buildShippingAddressHtml(
    order
  )}
      </div>
    </div>
  `;
  return buildEmailShell({
    storeName,
    eyebrow: "Shipping update",
    title: "Your order has shipped",
    intro: "Good news - your package is on the way.",
    content,
    footerText: `This shipping update was sent by ${storeName}.`
  });
}
__name(shippingConfirmationTemplate, "shippingConfirmationTemplate");
function shippingConfirmationText(order, config) {
  return [
    config.storeName,
    "",
    "Your order has shipped.",
    "Good news - your package is on the way.",
    "",
    `Order: ${order.order_reference}`,
    `Carrier: ${order.carrier || "Shipping carrier"}`,
    `Tracking number: ${order.tracking_number || ""}`,
    order.tracking_url ? `Track your package: ${order.tracking_url}` : null,
    "",
    "SHIPPING TO",
    buildShippingAddressText(
      order
    )
  ].filter(
    (value) => value !== null
  ).join("\n");
}
__name(shippingConfirmationText, "shippingConfirmationText");
async function sendShippingConfirmation(env, order) {
  if (!order?.email) {
    throw new Error(
      "Cannot send shipping confirmation without customer email"
    );
  }
  if (!order?.tracking_number) {
    throw new Error(
      "Cannot send shipping confirmation without tracking number"
    );
  }
  const provider = getEmailProvider(env);
  const storeConfig = getStoreConfig(env);
  const config = {
    storeName: storeConfig.name,
    from: storeConfig.emailFrom
  };
  const message = {
    from: config.from,
    to: order.email,
    subject: `Your order has shipped - ${order.order_reference}`,
    html: shippingConfirmationTemplate(
      order,
      config
    ),
    text: shippingConfirmationText(
      order,
      config
    )
  };
  return provider.send(
    message,
    {
      idempotencyKey: `shipping-confirmation/${order.order_reference}`
    }
  );
}
__name(sendShippingConfirmation, "sendShippingConfirmation");
function fulfillmentFailureTemplate(order, config) {
  const storeName = config.storeName;
  const failureMessage = order.fulfillment_error || "Unknown fulfillment failure";
  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:18px;
        background:#fff7ed;
        border:1px solid #fed7aa;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:6px;
          font-size:13px;
          font-weight:700;
          color:#9a3412;
        "
      >
        Manual attention required
      </div>

      <div
        style="
          font-size:14px;
          line-height:1.6;
          color:#7c2d12;
        "
      >
        ${escapeHtml(
    failureMessage
  )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
    >
      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Order
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.order_reference
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Order ID
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.id
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Customer email
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.email
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.fulfillment_provider || "Not assigned"
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider status
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.fulfillment_provider_status || order.fulfillment_status || "FAILED"
  )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider order ID
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
    order.fulfillment_order_id || "Not available"
  )}
        </td>
      </tr>
    </table>

    <p
      style="
        margin:28px 0 0;
        font-size:14px;
        line-height:1.6;
        color:#4b5563;
      "
    >
      Review the order and fulfillment provider
      before attempting any manual retry.
    </p>
  `;
  return buildEmailShell({
    storeName,
    eyebrow: "Operational alert",
    title: "Fulfillment failure",
    intro: "A paid order could not be submitted or updated successfully with the fulfillment provider.",
    content,
    footerText: `Automated operational alert from ${storeName}.`
  });
}
__name(fulfillmentFailureTemplate, "fulfillmentFailureTemplate");
function fulfillmentFailureText(order, config) {
  return [
    config.storeName,
    "",
    "FULFILLMENT FAILURE",
    "",
    "A paid order requires manual attention.",
    "",
    `Order: ${order.order_reference}`,
    `Order ID: ${order.id}`,
    `Customer email: ${order.email || ""}`,
    `Provider: ${order.fulfillment_provider || "Not assigned"}`,
    `Provider status: ${order.fulfillment_provider_status || order.fulfillment_status || "FAILED"}`,
    `Provider order ID: ${order.fulfillment_order_id || "Not available"}`,
    "",
    "Failure details:",
    order.fulfillment_error || "Unknown fulfillment failure",
    "",
    "Review the order and fulfillment provider before attempting any manual retry."
  ].join("\n");
}
__name(fulfillmentFailureText, "fulfillmentFailureText");
async function sendFulfillmentFailureAlert(env, order) {
  if (!env.STORE_ADMIN_EMAIL) {
    throw new Error(
      "STORE_ADMIN_EMAIL is not configured"
    );
  }
  const provider = getEmailProvider(env);
  const storeConfig = getStoreConfig(env);
  const config = {
    storeName: storeConfig.name,
    from: storeConfig.emailFrom
  };
  const message = {
    from: config.from,
    to: env.STORE_ADMIN_EMAIL,
    subject: `Fulfillment failed - ${order.order_reference}`,
    html: fulfillmentFailureTemplate(
      order,
      config
    ),
    text: fulfillmentFailureText(
      order,
      config
    )
  };
  return provider.send(
    message,
    {
      idempotencyKey: `fulfillment-failure/${order.order_reference}`
    }
  );
}
__name(sendFulfillmentFailureAlert, "sendFulfillmentFailureAlert");

// src/notifications.js
var NOTIFICATION_TYPES = {
  ORDER_CONFIRMATION: "ORDER_CONFIRMATION",
  SHIPPING_CONFIRMATION: "SHIPPING_CONFIRMATION",
  DELIVERY_CONFIRMATION: "DELIVERY_CONFIRMATION",
  FULFILLMENT_FAILURE: "FULFILLMENT_FAILURE"
};
async function claimOrderNotification(env, {
  orderId,
  type,
  provider = "resend"
}) {
  const result = await env.DB.prepare(
    `
        INSERT OR IGNORE INTO
          order_notifications (
            order_id,
            type,
            provider,
            status,
            attempts,
            created_at,
            updated_at
          )
        VALUES (
          ?,
          ?,
          ?,
          'SENDING',
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
  ).bind(
    orderId,
    type,
    provider
  ).run();
  const claimed = Number(
    result.meta?.changes || 0
  ) === 1;
  if (claimed) {
    console.log(
      "NOTIFICATION CLAIMED",
      {
        orderId,
        type,
        provider
      }
    );
  } else {
    console.log(
      "NOTIFICATION ALREADY CLAIMED",
      {
        orderId,
        type
      }
    );
  }
  return claimed;
}
__name(claimOrderNotification, "claimOrderNotification");
async function markNotificationSent(env, {
  orderId,
  type,
  providerMessageId = null
}) {
  await env.DB.prepare(
    `
      UPDATE order_notifications

      SET
        status = 'SENT',
        provider_message_id = ?,
        last_error = NULL,
        sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP

      WHERE order_id = ?
        AND type = ?
    `
  ).bind(
    providerMessageId,
    orderId,
    type
  ).run();
  console.log(
    "NOTIFICATION MARKED SENT",
    {
      orderId,
      type,
      providerMessageId
    }
  );
}
__name(markNotificationSent, "markNotificationSent");
async function markNotificationFailed(env, {
  orderId,
  type,
  error
}) {
  const message = error?.message || String(error);
  await env.DB.prepare(
    `
      UPDATE order_notifications

      SET
        status = 'FAILED',
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE order_id = ?
        AND type = ?
    `
  ).bind(
    message.slice(0, 2e3),
    orderId,
    type
  ).run();
  console.error(
    "NOTIFICATION MARKED FAILED",
    {
      orderId,
      type,
      message
    }
  );
}
__name(markNotificationFailed, "markNotificationFailed");

// src/tax/florida.js
var FLORIDA_STATE_RATE = 0.06;
var FLORIDA_SURTAX_SIMPLE_LIMIT_CENTS = 5e5;
var STREET_SUFFIXES = {
  STREET: "ST",
  ST: "ST",
  ROAD: "RD",
  RD: "RD",
  AVENUE: "AVE",
  AVE: "AVE",
  BOULEVARD: "BLVD",
  BLVD: "BLVD",
  DRIVE: "DR",
  DR: "DR",
  LANE: "LN",
  LN: "LN",
  COURT: "CT",
  CT: "CT",
  CIRCLE: "CIR",
  CIR: "CIR",
  HIGHWAY: "HWY",
  HWY: "HWY",
  PARKWAY: "PKWY",
  PKWY: "PKWY",
  PLACE: "PL",
  PL: "PL",
  TERRACE: "TER",
  TER: "TER",
  TRAIL: "TRL",
  TRL: "TRL",
  WAY: "WAY",
  LOOP: "LOOP"
};
var DIRECTIONS = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
  N: "N",
  S: "S",
  E: "E",
  W: "W",
  NE: "NE",
  NW: "NW",
  SE: "SE",
  SW: "SW"
};
var UNIT_MARKERS = /* @__PURE__ */ new Set([
  "APT",
  "APARTMENT",
  "UNIT",
  "STE",
  "SUITE",
  "#"
]);
function normalizeToken(value) {
  return String(value || "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}
__name(normalizeToken, "normalizeToken");
function parseFloridaAddress(address1) {
  const normalized = normalizeToken(address1);
  let tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) {
    throw new Error(
      "Florida tax address could not be parsed."
    );
  }
  const houseNumber = tokens.shift();
  const unitIndex = tokens.findIndex(
    (token) => UNIT_MARKERS.has(token)
  );
  if (unitIndex >= 0) {
    tokens = tokens.slice(
      0,
      unitIndex
    );
  }
  let predir = "";
  let postdir = "";
  let streetSuffix = "";
  if (tokens.length > 0 && DIRECTIONS[tokens[0]]) {
    predir = DIRECTIONS[tokens.shift()];
  }
  if (tokens.length > 0 && DIRECTIONS[tokens[tokens.length - 1]]) {
    postdir = DIRECTIONS[tokens.pop()];
  }
  if (tokens.length > 0 && STREET_SUFFIXES[tokens[tokens.length - 1]]) {
    streetSuffix = STREET_SUFFIXES[tokens.pop()];
  }
  const streetName = tokens.join(" ");
  if (!houseNumber || !streetName) {
    throw new Error(
      "Florida tax address could not be parsed."
    );
  }
  return {
    houseNumber,
    predir,
    streetName,
    streetSuffix,
    postdir
  };
}
__name(parseFloridaAddress, "parseFloridaAddress");
async function resolveFloridaCounty(env, shipping) {
  const country = normalizeToken(
    shipping.country
  );
  const state = normalizeToken(
    shipping.state
  );
  if (country !== "US" || state !== "FL") {
    return null;
  }
  const parsed = parseFloridaAddress(
    shipping.address1
  );
  const zip = String(
    shipping.postalCode || ""
  ).trim().slice(0, 5);
  const city = normalizeToken(
    shipping.city
  );
  let result = await env.DB.prepare(
    `
        SELECT
          a.county_id,
          c.county_name,
          c.surtax_rate

        FROM fl_tax_addresses a

        JOIN fl_tax_counties c
          ON c.county_id =
             a.county_id

        WHERE
          a.zip = ?
          AND a.house_number = ?
          AND a.predir = ?
          AND a.street_name = ?
          AND a.street_suffix = ?
          AND a.postdir = ?
          AND a.city = ?

        LIMIT 1
        `
  ).bind(
    zip,
    parsed.houseNumber,
    parsed.predir,
    parsed.streetName,
    parsed.streetSuffix,
    parsed.postdir,
    city
  ).first();
  if (result) {
    return buildCountyResult(
      result
    );
  }
  const fallback = await env.DB.prepare(
    `
        SELECT DISTINCT
          a.county_id,
          c.county_name,
          c.surtax_rate

        FROM fl_tax_addresses a

        JOIN fl_tax_counties c
          ON c.county_id =
             a.county_id

        WHERE
          a.zip = ?
          AND a.house_number = ?
          AND a.predir = ?
          AND a.street_name = ?
          AND a.street_suffix = ?
          AND a.postdir = ?

        LIMIT 2
        `
  ).bind(
    zip,
    parsed.houseNumber,
    parsed.predir,
    parsed.streetName,
    parsed.streetSuffix,
    parsed.postdir
  ).all();
  const matches = fallback.results || [];
  if (matches.length !== 1) {
    return null;
  }
  return buildCountyResult(
    matches[0]
  );
}
__name(resolveFloridaCounty, "resolveFloridaCounty");
function buildCountyResult(result) {
  const surtaxRate = Number(
    result.surtax_rate
  );
  return {
    countyId: result.county_id,
    countyName: result.county_name,
    stateRate: FLORIDA_STATE_RATE,
    surtaxRate,
    combinedRate: FLORIDA_STATE_RATE + surtaxRate
  };
}
__name(buildCountyResult, "buildCountyResult");
function calculateTaxCents(taxableCents, rate) {
  const amount = Number(taxableCents);
  const basisPoints = Math.round(
    Number(rate) * 1e4
  );
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      "Taxable amount must be a non-negative integer number of cents."
    );
  }
  if (!Number.isInteger(
    basisPoints
  ) || basisPoints < 0) {
    throw new Error(
      "Tax rate is invalid."
    );
  }
  return Math.floor(
    (amount * basisPoints + 5e3) / 1e4
  );
}
__name(calculateTaxCents, "calculateTaxCents");
async function calculateFloridaTax(env, {
  shipping,
  merchandiseSubtotal,
  shippingAmount
}) {
  const merchandise = Number(
    merchandiseSubtotal
  );
  const delivery = Number(
    shippingAmount
  );
  if (!Number.isInteger(
    merchandise
  ) || merchandise < 0) {
    throw new Error(
      "Merchandise subtotal must be a non-negative integer number of cents."
    );
  }
  if (!Number.isInteger(
    delivery
  ) || delivery < 0) {
    throw new Error(
      "Shipping amount must be a non-negative integer number of cents."
    );
  }
  const country = normalizeToken(
    shipping.country
  );
  const state = normalizeToken(
    shipping.state
  );
  if (country !== "US" || state !== "FL") {
    return {
      taxable: false,
      jurisdiction: null,
      merchandiseSubtotal: merchandise,
      shippingAmount: delivery,
      taxableBase: 0,
      stateRate: 0,
      surtaxRate: 0,
      combinedRate: 0,
      stateTaxAmount: 0,
      surtaxAmount: 0,
      taxAmount: 0
    };
  }
  const jurisdiction = await resolveFloridaCounty(
    env,
    shipping
  );
  if (!jurisdiction) {
    throw new Error(
      "Unable to determine the Florida tax jurisdiction for this shipping address."
    );
  }
  const taxableBase = merchandise + delivery;
  if (taxableBase > FLORIDA_SURTAX_SIMPLE_LIMIT_CENTS) {
    throw new Error(
      "Florida orders above $5,000 require item-level discretionary surtax calculation."
    );
  }
  const stateTaxAmount = calculateTaxCents(
    taxableBase,
    jurisdiction.stateRate
  );
  const surtaxAmount = calculateTaxCents(
    taxableBase,
    jurisdiction.surtaxRate
  );
  const taxAmount = stateTaxAmount + surtaxAmount;
  return {
    taxable: true,
    jurisdiction: {
      countyId: jurisdiction.countyId,
      countyName: jurisdiction.countyName
    },
    merchandiseSubtotal: merchandise,
    shippingAmount: delivery,
    taxableBase,
    stateRate: jurisdiction.stateRate,
    surtaxRate: jurisdiction.surtaxRate,
    combinedRate: jurisdiction.combinedRate,
    stateTaxAmount,
    surtaxAmount,
    taxAmount
  };
}
__name(calculateFloridaTax, "calculateFloridaTax");

// src/global-payments.js
var GP_API = "https://apis.sandbox.globalpay.com/ucp";
var GP_VERSION = "2021-03-22";
async function sha512(value) {
  const data = new TextEncoder().encode(
    value
  );
  const hashBuffer = await crypto.subtle.digest(
    "SHA-512",
    data
  );
  return Array.from(
    new Uint8Array(
      hashBuffer
    )
  ).map(
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}
__name(sha512, "sha512");
async function getAccessToken(env) {
  const nonce = (/* @__PURE__ */ new Date()).toISOString();
  const secret = await sha512(
    nonce + env.GP_APP_KEY
  );
  const response = await fetch(
    `${GP_API}/accesstoken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GP-Version": GP_VERSION
      },
      body: JSON.stringify({
        app_id: env.GP_APP_ID,
        nonce,
        secret,
        grant_type: "client_credentials"
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error(
      "Global Payments authentication failed:",
      data
    );
    throw new Error(
      "Unable to authenticate with Global Payments."
    );
  }
  if (!data.token) {
    console.error(
      "Global Payments token missing:",
      data
    );
    throw new Error(
      "Global Payments did not return an access token."
    );
  }
  return data;
}
__name(getAccessToken, "getAccessToken");
async function createHostedPaymentPage(env, {
  amount,
  currency,
  reference,
  email,
  customerName,
  paymentReturnUrl
}) {
  const tokenData = await getAccessToken(
    env
  );
  const accessToken = tokenData.token;
  const returnUrlObject = new URL(
    paymentReturnUrl
  );
  returnUrlObject.searchParams.set(
    "reference",
    reference
  );
  const returnUrl = returnUrlObject.toString();
  const response = await fetch(
    `${GP_API}/links`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-GP-Version": GP_VERSION
      },
      body: JSON.stringify({
        account_name: "transaction_processing_hpp",
        type: "HOSTED_PAYMENT_PAGE",
        name: "Jekyll Commerce Checkout",
        description: "Online store purchase",
        usage_mode: "SINGLE",
        reference,
        payer: {
          email
        },
        order: {
          amount: String(
            amount
          ),
          currency,
          reference,
          transaction_configuration: {
            channel: "CNP",
            country: "US",
            capture_mode: "AUTO",
            allowed_payment_methods: [
              "CARD"
            ]
          }
        },
        payment_method_configuration: {
          authentication: {
            preference: "CHALLENGE_PREFERRED"
          }
        },
        notifications: {
          return_url: returnUrl
        }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error(
      "Unable to create HPP:",
      {
        status: response.status,
        response: data
      }
    );
    throw new Error(
      "Unable to create hosted checkout."
    );
  }
  if (!data.url) {
    console.error(
      "Global Payments HPP URL missing:",
      data
    );
    throw new Error(
      "Global Payments did not return a checkout URL."
    );
  }
  return data;
}
__name(createHostedPaymentPage, "createHostedPaymentPage");

// src/catalog/products.js
var catalogProducts = [
  {
    id: "WWT-001",
    name: "Weekend Warrior Tee",
    variants: [
      {
        sku: "WWT-BLK-S",
        price: 2499,
        options: {
          color: "Black",
          size: "S"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 73196
        }
      },
      {
        sku: "WWT-BLK-M",
        price: 2499,
        options: {
          color: "Black",
          size: "M"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 73200
        }
      },
      {
        sku: "WWT-BLK-L",
        price: 2499,
        options: {
          color: "Black",
          size: "L"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 73204
        }
      },
      {
        sku: "WWT-BLK-XL",
        price: 2499,
        options: {
          color: "Black",
          size: "XL"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 73208
        }
      },
      {
        sku: "WWT-BLK-2XL",
        price: 2499,
        options: {
          color: "Black",
          size: "2XL"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 73212
        }
      },
      {
        sku: "WWT-BLK-3XL",
        price: 2499,
        options: {
          color: "Black",
          size: "3XL"
        },
        fulfillment: {
          provider: "printify",
          productId: "6aa0456da0a5fe1c1607d25b",
          variantId: 79114
        }
      },
      {
        sku: "WWT-NVY-S",
        price: 2499,
        options: {
          color: "Navy",
          size: "S"
        },
        fulfillment: null
      },
      {
        sku: "WWT-NVY-M",
        price: 2499,
        options: {
          color: "Navy",
          size: "M"
        },
        fulfillment: null
      },
      {
        sku: "WWT-NVY-L",
        price: 2499,
        options: {
          color: "Navy",
          size: "L"
        },
        fulfillment: null
      },
      {
        sku: "WWT-NVY-XL",
        price: 2499,
        options: {
          color: "Navy",
          size: "XL"
        },
        fulfillment: null
      },
      {
        sku: "WWT-NVY-2XL",
        price: 2499,
        options: {
          color: "Navy",
          size: "2XL"
        },
        fulfillment: null
      },
      {
        sku: "WWT-NVY-3XL",
        price: 2499,
        options: {
          color: "Navy",
          size: "3XL"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-S",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "S"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-M",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "M"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-L",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "L"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-XL",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "XL"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-2XL",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "2XL"
        },
        fulfillment: null
      },
      {
        sku: "WWT-HGR-3XL",
        price: 2499,
        options: {
          color: "Heather Gray",
          size: "3XL"
        },
        fulfillment: null
      }
    ]
  },
  {
    id: "TMB-001",
    name: "Test Tumbler",
    variants: [
      {
        sku: "TMB-BLK-20OZ",
        price: 2999,
        options: {
          color: "Black",
          capacity: "20 oz"
        },
        fulfillment: null
      },
      {
        sku: "TMB-BLK-30OZ",
        price: 3499,
        options: {
          color: "Black",
          capacity: "30 oz"
        },
        fulfillment: null
      },
      {
        sku: "TMB-WHT-20OZ",
        price: 2999,
        options: {
          color: "White",
          capacity: "20 oz"
        },
        fulfillment: null
      },
      {
        sku: "TMB-WHT-30OZ",
        price: 3499,
        options: {
          color: "White",
          capacity: "30 oz"
        },
        fulfillment: null
      }
    ]
  }
];

// src/catalog/helpers.js
function buildSkuCatalog() {
  const catalog = {};
  for (const product of catalogProducts) {
    for (const variant of product.variants) {
      const options = variant.options || {};
      catalog[variant.sku] = {
        productId: product.id,
        name: product.name,
        price: variant.price,
        options: {
          ...options
        },
        /*
         * Backward compatibility.
         *
         * Existing backend code still
         * reads color / size directly.
         *
         * These can be removed later
         * once the order pipeline is
         * fully generic.
         */
        color: options.color || null,
        size: options.size || null
      };
    }
  }
  return catalog;
}
__name(buildSkuCatalog, "buildSkuCatalog");
function buildFulfillmentCatalog() {
  const catalog = {};
  for (const product of catalogProducts) {
    for (const variant of product.variants) {
      if (!variant.fulfillment) {
        continue;
      }
      if (!variant.sku || !variant.fulfillment.provider || !variant.fulfillment.productId || !variant.fulfillment.variantId) {
        throw new Error(
          `Invalid fulfillment configuration for SKU ${variant.sku || "UNKNOWN"}.`
        );
      }
      if (Object.prototype.hasOwnProperty.call(
        catalog,
        variant.sku
      )) {
        throw new Error(
          `Duplicate fulfillment SKU detected: ${variant.sku}.`
        );
      }
      catalog[variant.sku] = {
        provider: variant.fulfillment.provider,
        productId: variant.fulfillment.productId,
        variantId: variant.fulfillment.variantId
      };
    }
  }
  return catalog;
}
__name(buildFulfillmentCatalog, "buildFulfillmentCatalog");

// src/products.js
var products = buildSkuCatalog();

// src/fulfillment/providers.js
var fulfillmentProducts = buildFulfillmentCatalog();
function getFulfillmentProduct(sku) {
  return fulfillmentProducts[sku] || null;
}
__name(getFulfillmentProduct, "getFulfillmentProduct");

// src/fulfillment/printify.js
var PRINTIFY_API = "https://api.printify.com/v1";
function splitName(fullName) {
  const value = String(fullName || "").trim();
  if (!value) {
    return {
      firstName: "",
      lastName: ""
    };
  }
  const parts = value.split(/\s+/);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: ""
    };
  }
  return {
    firstName: parts.shift(),
    lastName: parts.join(" ")
  };
}
__name(splitName, "splitName");
async function printifyRequest(env, path, options = {}) {
  if (!env.PRINTIFY_API_TOKEN) {
    throw new Error(
      "PRINTIFY_API_TOKEN is not configured."
    );
  }
  if (!env.PRINTIFY_SHOP_ID) {
    throw new Error(
      "PRINTIFY_SHOP_ID is not configured."
    );
  }
  const headers = {
    "Authorization": `Bearer ${env.PRINTIFY_API_TOKEN}`,
    "User-Agent": "jekyll-commerce-api",
    "Content-Type": "application/json",
    ...options.headers || {}
  };
  const response = await fetch(
    `${PRINTIFY_API}${path}`,
    {
      ...options,
      headers
    }
  );
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    console.error(
      "Printify API error:",
      response.status,
      data
    );
    const message = data?.message || data?.error || `Printify request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return data;
}
__name(printifyRequest, "printifyRequest");
function buildAddress(customer) {
  const name = splitName(customer.name);
  return {
    first_name: name.firstName,
    last_name: name.lastName,
    email: customer.email,
    phone: customer.phone || "",
    country: customer.country || "US",
    region: customer.state,
    address1: customer.address1,
    address2: customer.address2 || "",
    city: customer.city,
    zip: customer.postalCode
  };
}
__name(buildAddress, "buildAddress");
function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(
    date.getTime()
  )) {
    return String(value);
  }
  return date.toISOString();
}
__name(normalizeTimestamp, "normalizeTimestamp");
function getShipments(data) {
  if (!Array.isArray(data?.shipments)) {
    return [];
  }
  return data.shipments;
}
__name(getShipments, "getShipments");
function getPrimaryShipment(data) {
  const shipments = getShipments(data);
  if (shipments.length === 0) {
    return null;
  }
  return shipments.find(function(shipment) {
    return shipment?.number || shipment?.url || shipment?.carrier;
  }) || shipments[0];
}
__name(getPrimaryShipment, "getPrimaryShipment");
function allShipmentsDelivered(data) {
  const shipments = getShipments(data);
  if (shipments.length === 0) {
    return false;
  }
  return shipments.every(
    function(shipment) {
      return Boolean(
        shipment?.delivered_at
      );
    }
  );
}
__name(allShipmentsDelivered, "allShipmentsDelivered");
function getDeliveredAt(data) {
  const shipments = getShipments(data);
  const delivered = shipments.map(function(shipment) {
    return shipment?.delivered_at;
  }).filter(Boolean);
  if (delivered.length === 0) {
    return null;
  }
  const timestamps = delivered.map(function(value) {
    const date = new Date(value);
    if (Number.isNaN(
      date.getTime()
    )) {
      return null;
    }
    return date;
  }).filter(Boolean).sort(function(a, b) {
    return a.getTime() - b.getTime();
  });
  if (timestamps.length === 0) {
    return normalizeTimestamp(
      delivered[delivered.length - 1]
    );
  }
  return timestamps[timestamps.length - 1].toISOString();
}
__name(getDeliveredAt, "getDeliveredAt");
function getShippedAt(data) {
  const shipments = getShipments(data);
  const shipmentDates = shipments.map(function(shipment) {
    return shipment?.shipped_at || shipment?.created_at || null;
  }).filter(Boolean);
  if (shipmentDates.length > 0) {
    return normalizeTimestamp(
      shipmentDates[0]
    );
  }
  if (data?.status === "fulfilled" || data?.status === "partially-fulfilled") {
    return normalizeTimestamp(
      data?.fulfilled_at
    );
  }
  return null;
}
__name(getShippedAt, "getShippedAt");
function normalizePrintifyOrder(data) {
  if (!data) {
    throw new Error(
      "Printify order data is required."
    );
  }
  const providerStatus = String(
    data.status || ""
  ).trim().toLowerCase();
  const primaryShipment = getPrimaryShipment(data);
  const delivered = allShipmentsDelivered(data);
  let status = "SUBMITTED";
  if (delivered) {
    status = "DELIVERED";
  } else {
    switch (providerStatus) {
      case "on-hold":
        status = "ON_HOLD";
        break;
      case "sending-to-production":
      case "in-production":
        status = "IN_PRODUCTION";
        break;
      case "partially-fulfilled":
      case "fulfilled":
      case "shipped":
        status = "SHIPPED";
        break;
      case "delivered":
        status = "DELIVERED";
        break;
      case "canceled":
      case "cancelled":
        status = "CANCELED";
        break;
      case "payment-not-received":
      case "has-issues":
      case "unfulfillable":
      case "source-check-failed":
        status = "FAILED";
        break;
      default:
        status = "SUBMITTED";
        break;
    }
  }
  return {
    status,
    providerStatus: providerStatus || null,
    trackingNumber: primaryShipment?.number || null,
    trackingUrl: primaryShipment?.url || null,
    carrier: primaryShipment?.carrier || null,
    shippedAt: getShippedAt(data),
    deliveredAt: getDeliveredAt(data),
    fulfilledAt: normalizeTimestamp(
      data?.fulfilled_at
    ),
    sentToProductionAt: normalizeTimestamp(
      data?.sent_to_production_at
    ),
    shipments: getShipments(data),
    data
  };
}
__name(normalizePrintifyOrder, "normalizePrintifyOrder");
async function calculatePrintifyShipping(env, customer, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      "Shipping quote requires at least one item."
    );
  }
  const lineItems = items.map(
    function(item, index) {
      if (!item.printifyProductId || !item.printifyVariantId) {
        throw new Error(
          `Missing Printify shipping mapping for SKU ${item.sku}.`
        );
      }
      return {
        product_id: item.printifyProductId,
        variant_id: item.printifyVariantId,
        quantity: item.quantity,
        external_id: `shipping-${index + 1}`
      };
    }
  );
  const payload = {
    line_items: lineItems,
    address_to: buildAddress(customer)
  };
  console.log(
    "REQUESTING PRINTIFY SHIPPING QUOTE",
    {
      itemCount: lineItems.length,
      postalCode: customer.postalCode,
      state: customer.state
    }
  );
  const data = await printifyRequest(
    env,
    `/shops/${env.PRINTIFY_SHOP_ID}/orders/shipping.json`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
  console.log(
    "PRINTIFY SHIPPING QUOTE",
    data
  );
  return data;
}
__name(calculatePrintifyShipping, "calculatePrintifyShipping");
async function createPrintifyOrder(env, order, items) {
  if (!order) {
    throw new Error(
      "Order is required for Printify fulfillment."
    );
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      "Order contains no fulfillment items."
    );
  }
  const name = splitName(
    order.customer_name
  );
  const lineItems = items.map(
    function(item, index) {
      if (!item.printify_product_id || !item.printify_variant_id) {
        throw new Error(
          `Missing Printify mapping for SKU ${item.sku}.`
        );
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(
          `Invalid fulfillment quantity for SKU ${item.sku}.`
        );
      }
      return {
        product_id: item.printify_product_id,
        variant_id: item.printify_variant_id,
        quantity: item.quantity,
        external_id: `${order.order_reference}-${index + 1}`
      };
    }
  );
  const payload = {
    external_id: order.order_reference,
    label: order.order_reference,
    line_items: lineItems,
    shipping_method: 1,
    is_printify_express: false,
    is_economy_shipping: false,
    send_shipping_notification: false,
    address_to: {
      first_name: name.firstName,
      last_name: name.lastName,
      email: order.email,
      phone: order.phone || "",
      country: order.shipping_country || "US",
      region: order.shipping_state,
      address1: order.shipping_address1,
      address2: order.shipping_address2 || "",
      city: order.shipping_city,
      zip: order.shipping_postal_code
    }
  };
  console.log(
    "Creating Printify order:",
    order.order_reference
  );
  const data = await printifyRequest(
    env,
    `/shops/${env.PRINTIFY_SHOP_ID}/orders.json`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
  console.log(
    "Printify order created:",
    {
      reference: order.order_reference,
      printifyOrderId: data?.id || null
    }
  );
  return data;
}
__name(createPrintifyOrder, "createPrintifyOrder");
async function getPrintifyOrder(env, printifyOrderId) {
  if (!printifyOrderId) {
    throw new Error(
      "Printify order ID is required."
    );
  }
  return printifyRequest(
    env,
    `/shops/${env.PRINTIFY_SHOP_ID}/orders/${encodeURIComponent(
      printifyOrderId
    )}.json`,
    {
      method: "GET"
    }
  );
}
__name(getPrintifyOrder, "getPrintifyOrder");

// src/fulfillment/index.js
function prepareFulfillmentItems(orderItems) {
  if (!Array.isArray(orderItems)) {
    throw new Error(
      "Order items are required."
    );
  }
  return orderItems.map(
    function(item) {
      const mapping = getFulfillmentProduct(
        item.sku
      );
      if (!mapping) {
        throw new Error(
          `No fulfillment mapping exists for SKU ${item.sku}.`
        );
      }
      return {
        ...item,
        fulfillment_provider: mapping.provider,
        printify_product_id: mapping.productId,
        printify_variant_id: mapping.variantId
      };
    }
  );
}
__name(prepareFulfillmentItems, "prepareFulfillmentItems");
async function fulfillOrder(env, order, orderItems) {
  if (env.APP_ENV === "sandbox") {
    throw new Error(
      "Fulfillment submission is disabled in sandbox."
    );
  }
  if (!order) {
    throw new Error(
      "Order is required."
    );
  }
  if (order.payment_status !== "PAID") {
    throw new Error(
      "Only PAID orders may be fulfilled."
    );
  }
  if (order.fulfillment_status !== "SUBMITTING") {
    throw new Error(
      `Order cannot be fulfilled from status ${order.fulfillment_status}.`
    );
  }
  const items = prepareFulfillmentItems(
    orderItems
  );
  const providers = new Set(
    items.map(function(item) {
      return item.fulfillment_provider;
    })
  );
  if (providers.size !== 1) {
    throw new Error(
      "Multi-provider orders are not supported yet."
    );
  }
  const provider = items[0].fulfillment_provider;
  switch (provider) {
    case "printify": {
      const data = await createPrintifyOrder(
        env,
        order,
        items
      );
      const normalized = normalizePrintifyOrder(data);
      return {
        provider: "printify",
        ...normalized
      };
    }
    default:
      throw new Error(
        `Unsupported fulfillment provider: ${provider}`
      );
  }
}
__name(fulfillOrder, "fulfillOrder");
async function reconcileFulfillmentOrder(env, order) {
  if (!order) {
    throw new Error(
      "Order is required."
    );
  }
  if (!order.fulfillment_provider) {
    throw new Error(
      "Order has no fulfillment provider."
    );
  }
  if (!order.fulfillment_order_id) {
    throw new Error(
      "Order has no fulfillment order ID."
    );
  }
  switch (order.fulfillment_provider) {
    case "printify": {
      const data = await getPrintifyOrder(
        env,
        order.fulfillment_order_id
      );
      const normalized = normalizePrintifyOrder(data);
      return {
        provider: "printify",
        ...normalized
      };
    }
    default:
      throw new Error(
        `Unsupported fulfillment provider: ${order.fulfillment_provider}`
      );
  }
}
__name(reconcileFulfillmentOrder, "reconcileFulfillmentOrder");

// src/shipping.js
function prepareShippingItems(cartItems) {
  return cartItems.map(
    function(item) {
      const mapping = getFulfillmentProduct(
        item.sku
      );
      if (!mapping) {
        throw new Error(
          `No shipping mapping exists for SKU ${item.sku}.`
        );
      }
      if (mapping.provider !== "printify") {
        throw new Error(
          `Shipping provider ${mapping.provider} is not supported yet.`
        );
      }
      return {
        sku: item.sku,
        quantity: item.quantity,
        provider: mapping.provider,
        printifyProductId: mapping.productId,
        printifyVariantId: mapping.variantId
      };
    }
  );
}
__name(prepareShippingItems, "prepareShippingItems");
async function calculateShipping(env, customer, cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error(
      "Cart is empty."
    );
  }
  const items = prepareShippingItems(
    cartItems
  );
  const providers = new Set(
    items.map(
      (item) => item.provider
    )
  );
  if (providers.size !== 1) {
    throw new Error(
      "Multi-provider shipping is not supported yet."
    );
  }
  const provider = items[0].provider;
  if (provider !== "printify") {
    throw new Error(
      `Unsupported shipping provider: ${provider}`
    );
  }
  const quote = await calculatePrintifyShipping(
    env,
    customer,
    items
  );
  const standard = Number(
    quote?.standard
  );
  if (!Number.isInteger(
    standard
  ) || standard < 0) {
    throw new Error(
      "Printify did not return a valid standard shipping rate."
    );
  }
  return {
    provider: "printify",
    method: "standard",
    amount: standard,
    availableMethods: quote
  };
}
__name(calculateShipping, "calculateShipping");

// src/index.js
var PRINTIFY_WEBHOOK_EVENTS = /* @__PURE__ */ new Set([
  "order:updated",
  "order:sent-to-production",
  "order:shipment:created",
  "order:shipment:delivered"
]);
function paymentRedirect(destination) {
  const safeDestination = JSON.stringify(destination);
  return new Response(
    `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Cache-Control" content="no-store">
        <meta http-equiv="refresh" content="0;url=${destination}">
        <title>Payment Result</title>
      </head>
      <body>
        <p>Returning to store...</p>
        <script>
          window.location.replace(${safeDestination});
        <\/script>
        <p><a href="${destination}">Continue</a></p>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
__name(paymentRedirect, "paymentRedirect");
function jsonResponse(data, status, corsHeaders) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
}
__name(jsonResponse, "jsonResponse");
function cleanString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}
__name(cleanString, "cleanString");
async function createOrderWithItems(env, orderData, validatedItems) {
  const customerStatusToken = crypto.randomUUID();
  const orderInsert = env.DB.prepare(
    `
        INSERT INTO orders (
          order_reference,
          email,
          customer_name,
          shipping_address1,
          shipping_address2,
          shipping_city,
          shipping_state,
          shipping_postal_code,
          shipping_country,
          phone,
          subtotal,
          merchandise_subtotal,
          shipping_amount,
          tax_amount,
          total,
          currency,
          payment_status,
          fulfillment_status,
          customer_status_token
        )
        VALUES (
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?
        )
      `
  ).bind(
    orderData.reference,
    orderData.email,
    orderData.customerName,
    orderData.address1,
    orderData.address2 || null,
    orderData.city,
    orderData.state,
    orderData.postalCode,
    orderData.country,
    orderData.phone || null,
    orderData.total,
    orderData.merchandiseSubtotal,
    orderData.shippingAmount,
    orderData.taxAmount,
    orderData.total,
    orderData.currency,
    "PENDING",
    "PENDING",
    customerStatusToken
  );
  const itemStatements = validatedItems.map((item) => {
    const product = products[item.sku];
    return env.DB.prepare(
      `
          INSERT INTO order_items (
            order_id,
            product_id,
            sku,
            product_name,
            color,
            size,
            options_json,
            quantity,
            unit_price
          )
          SELECT
            id,
            ?, ?, ?, ?, ?, ?, ?, ?
          FROM orders
          WHERE order_reference = ?
          LIMIT 1
        `
    ).bind(
      product.productId,
      item.sku,
      product.name,
      product.color || null,
      product.size || null,
      JSON.stringify(
        product.options || {}
      ),
      item.quantity,
      product.price,
      orderData.reference
    );
  });
  const orderLookup = env.DB.prepare(
    `
        SELECT id
        FROM orders
        WHERE order_reference = ?
        LIMIT 1
      `
  ).bind(
    orderData.reference
  );
  const results = await env.DB.batch([
    orderInsert,
    ...itemStatements,
    orderLookup
  ]);
  const lookupResult = results[results.length - 1];
  const orderId = Number(
    lookupResult?.results?.[0]?.id
  );
  if (!Number.isInteger(orderId) || orderId < 1) {
    throw new Error(
      "Order was created but its ID could not be resolved."
    );
  }
  return {
    orderId,
    customerStatusToken
  };
}
__name(createOrderWithItems, "createOrderWithItems");
async function loadPaymentState(env, orderId) {
  return env.DB.prepare(
    `
      SELECT
        id,
        payment_status,
        transaction_id,
        fulfillment_status
      FROM orders
      WHERE id = ?
      LIMIT 1
    `
  ).bind(orderId).first();
}
__name(loadPaymentState, "loadPaymentState");
function hexToBytes(value) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
__name(hexToBytes, "hexToBytes");
async function verifyPrintifyWebhookSignature(env, rawBody, signatureHeader) {
  if (!env.PRINTIFY_WEBHOOK_SECRET) {
    throw new Error("PRINTIFY_WEBHOOK_SECRET is not configured.");
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const signatureBytes = hexToBytes(signatureHeader.slice(7));
  if (!signatureBytes || signatureBytes.length !== 32) {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.PRINTIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(rawBody)
  );
}
__name(verifyPrintifyWebhookSignature, "verifyPrintifyWebhookSignature");
function webhookShipmentFallback(payload) {
  const data = payload?.resource?.data || {};
  const carrier = data?.carrier || {};
  return {
    trackingNumber: carrier?.tracking_number || null,
    trackingUrl: carrier?.tracking_url || null,
    carrier: carrier?.code || null,
    shippedAt: data?.shipped_at || null,
    deliveredAt: data?.delivered_at || null
  };
}
__name(webhookShipmentFallback, "webhookShipmentFallback");
async function loadFulfillmentOrderByProviderId(env, provider, providerOrderId) {
  return env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        payment_status,
        fulfillment_status,
        fulfillment_provider,
        fulfillment_order_id,
        fulfillment_provider_status,
        fulfillment_last_event_id,
        tracking_number,
        tracking_url,
        carrier,
        shipped_at,
        delivered_at,
        fulfilled_at
      FROM orders
      WHERE fulfillment_provider = ?
        AND fulfillment_order_id = ?
      LIMIT 1
    `
  ).bind(provider, providerOrderId).first();
}
__name(loadFulfillmentOrderByProviderId, "loadFulfillmentOrderByProviderId");
async function sendShippingConfirmationSafely(env, orderId) {
  const type = NOTIFICATION_TYPES.SHIPPING_CONFIRMATION;
  let claimed = false;
  try {
    const order = await env.DB.prepare(
      `
          SELECT
            id,
            order_reference,
            email,
            customer_name,
            shipping_address1,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_postal_code,
            shipping_country,
            fulfillment_status,
            tracking_number,
            tracking_url,
            carrier,
            shipped_at
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
    ).bind(orderId).first();
    if (!order) {
      throw new Error(
        "Shipping confirmation order could not be loaded."
      );
    }
    if (order.fulfillment_status !== "SHIPPED") {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason: "Order is not SHIPPED"
        }
      );
      return;
    }
    if (!order.tracking_number) {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason: "Tracking number is missing"
        }
      );
      return;
    }
    claimed = await claimOrderNotification(
      env,
      {
        orderId,
        type,
        provider: env.EMAIL_PROVIDER || "resend"
      }
    );
    if (!claimed) {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason: "Notification already claimed"
        }
      );
      return;
    }
    const result = await sendShippingConfirmation(
      env,
      order
    );
    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId: result?.id || null
      }
    );
    console.log(
      "SHIPPING CONFIRMATION SENT",
      {
        orderId: order.id,
        reference: order.order_reference,
        trackingNumber: order.tracking_number,
        emailId: result?.id || null
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (notificationError) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message: notificationError?.message || String(
              notificationError
            )
          }
        );
      }
    }
    console.error(
      "SHIPPING CONFIRMATION ERROR",
      {
        orderId,
        message: error?.message || String(error)
      }
    );
  }
}
__name(sendShippingConfirmationSafely, "sendShippingConfirmationSafely");
async function sendFulfillmentFailureAlertSafely(env, orderId) {
  const type = NOTIFICATION_TYPES.FULFILLMENT_FAILURE;
  let claimed = false;
  try {
    const order = await env.DB.prepare(
      `
          SELECT
            id,
            order_reference,
            email,
            payment_status,
            fulfillment_status,
            fulfillment_provider,
            fulfillment_provider_status,
            fulfillment_order_id,
            fulfillment_error
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
    ).bind(orderId).first();
    if (!order) {
      throw new Error(
        "Fulfillment failure alert order could not be loaded."
      );
    }
    if (order.payment_status !== "PAID" || order.fulfillment_status !== "FAILED") {
      console.log(
        "FULFILLMENT FAILURE ALERT SKIPPED",
        {
          orderId,
          reason: "Order is not a PAID + FAILED fulfillment"
        }
      );
      return;
    }
    claimed = await claimOrderNotification(
      env,
      {
        orderId,
        type,
        provider: env.EMAIL_PROVIDER || "resend"
      }
    );
    if (!claimed) {
      console.log(
        "FULFILLMENT FAILURE ALERT SKIPPED",
        {
          orderId,
          reason: "Notification already claimed"
        }
      );
      return;
    }
    const result = await sendFulfillmentFailureAlert(
      env,
      order
    );
    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId: result?.id || null
      }
    );
    console.log(
      "FULFILLMENT FAILURE ALERT SENT",
      {
        orderId: order.id,
        reference: order.order_reference,
        emailId: result?.id || null
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (notificationError) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message: notificationError?.message || String(
              notificationError
            )
          }
        );
      }
    }
    console.error(
      "FULFILLMENT FAILURE ALERT ERROR",
      {
        orderId,
        message: error?.message || String(error)
      }
    );
  }
}
__name(sendFulfillmentFailureAlertSafely, "sendFulfillmentFailureAlertSafely");
async function reconcileStoredFulfillmentOrder(env, order, options = {}) {
  const reconciliation = await reconcileFulfillmentOrder(env, order);
  const eventFallback = options.eventPayload ? webhookShipmentFallback(options.eventPayload) : {};
  const status = reconciliation.status || "SUBMITTED";
  const providerStatus = reconciliation.providerStatus || null;
  const trackingNumber = reconciliation.trackingNumber || eventFallback.trackingNumber || null;
  const trackingUrl = reconciliation.trackingUrl || eventFallback.trackingUrl || null;
  const carrier = reconciliation.carrier || eventFallback.carrier || null;
  const shippedAt = reconciliation.shippedAt || eventFallback.shippedAt || null;
  const deliveredAt = reconciliation.deliveredAt || eventFallback.deliveredAt || null;
  const fulfilledAt = reconciliation.fulfilledAt || null;
  const eventId = options.eventId || null;
  const fulfillmentError = status === "FAILED" ? `Printify reported fulfillment status: ${providerStatus || "failed"}.` : null;
  const updateResult = await env.DB.prepare(
    `
      UPDATE orders
      SET
		fulfillment_status =
		  CASE
			WHEN fulfillment_status = 'DELIVERED'
			  AND ? <> 'DELIVERED'
			  THEN fulfillment_status

			WHEN fulfillment_status = 'SHIPPED'
			  AND ? IN (
				'SUBMITTED',
				'ON_HOLD',
				'IN_PRODUCTION'
			  )
			  THEN fulfillment_status

			ELSE ?
		  END,
        fulfillment_provider_status = ?,
        fulfillment_reconciled_at = CURRENT_TIMESTAMP,
        fulfillment_last_event_id = COALESCE(?, fulfillment_last_event_id),
        tracking_number = COALESCE(?, tracking_number),
        tracking_url = COALESCE(?, tracking_url),
        carrier = COALESCE(?, carrier),
        shipped_at = COALESCE(?, shipped_at),
        delivered_at = COALESCE(?, delivered_at),
        fulfilled_at = COALESCE(?, fulfilled_at),
        fulfillment_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND payment_status = 'PAID'
        AND fulfillment_provider = ?
        AND fulfillment_order_id = ?
    `
  ).bind(
    status,
    // DELIVERED guard
    status,
    // SHIPPED regression guard
    status,
    // new status
    providerStatus,
    eventId,
    trackingNumber,
    trackingUrl,
    carrier,
    shippedAt,
    deliveredAt,
    fulfilledAt,
    fulfillmentError,
    order.id,
    order.fulfillment_provider,
    order.fulfillment_order_id
  ).run();
  if (!updateResult.meta || Number(updateResult.meta.changes || 0) === 0) {
    throw new Error(
      "Fulfillment reconciliation state update was not applied."
    );
  }
  if (status === "SHIPPED" && trackingNumber) {
    await sendShippingConfirmationSafely(
      env,
      order.id
    );
  }
  if (status === "FAILED") {
    await sendFulfillmentFailureAlertSafely(
      env,
      order.id
    );
  }
  console.log("FULFILLMENT RECONCILED", {
    orderId: order.id,
    reference: order.order_reference,
    provider: order.fulfillment_provider,
    providerOrderId: order.fulfillment_order_id,
    providerStatus,
    status,
    trackingNumber,
    carrier,
    shippedAt,
    deliveredAt,
    eventId
  });
  return {
    ...reconciliation,
    status,
    providerStatus,
    trackingNumber,
    trackingUrl,
    carrier,
    shippedAt,
    deliveredAt,
    fulfilledAt
  };
}
__name(reconcileStoredFulfillmentOrder, "reconcileStoredFulfillmentOrder");
async function detectStaleSubmittingFulfillmentOrders(env) {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        fulfillment_attempts,
        updated_at
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_status = 'SUBMITTING'
        AND fulfillment_order_id IS NULL
        AND updated_at <= datetime('now', '-30 minutes')
      ORDER BY updated_at ASC
      LIMIT 50
    `
  ).all();
  const orders = result.results || [];
  for (const order of orders) {
    console.error(
      "STALE FULFILLMENT SUBMISSION DETECTED",
      {
        orderId: order.id,
        reference: order.order_reference,
        attempts: order.fulfillment_attempts,
        updatedAt: order.updated_at
      }
    );
  }
  return {
    detected: orders.length
  };
}
__name(detectStaleSubmittingFulfillmentOrders, "detectStaleSubmittingFulfillmentOrders");
async function recoverPendingFulfillmentOrders(env) {
  const result = await env.DB.prepare(
    `
      SELECT id
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_status IN ('PENDING', 'READY')
        AND fulfillment_order_id IS NULL
      ORDER BY id ASC
      LIMIT 50
    `
  ).all();
  const orders = result.results || [];
  console.log("PENDING FULFILLMENT RECOVERY START", {
    count: orders.length
  });
  let recovered = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      await attemptFulfillment(
        env,
        order.id
      );
      recovered += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "PENDING FULFILLMENT RECOVERY ERROR",
        {
          orderId: order.id,
          message: error?.message || String(error)
        }
      );
    }
  }
  console.log("PENDING FULFILLMENT RECOVERY COMPLETE", {
    total: orders.length,
    recovered,
    failed
  });
  return {
    total: orders.length,
    recovered,
    failed
  };
}
__name(recoverPendingFulfillmentOrders, "recoverPendingFulfillmentOrders");
async function reconcileActiveFulfillmentOrders(env) {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        payment_status,
        fulfillment_status,
        fulfillment_provider,
        fulfillment_order_id,
        fulfillment_provider_status,
        fulfillment_last_event_id,
        tracking_number,
        tracking_url,
        carrier,
        shipped_at,
        delivered_at,
        fulfilled_at
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_provider = 'printify'
        AND fulfillment_order_id IS NOT NULL
        AND fulfillment_status IN (
          'SUBMITTED',
          'ON_HOLD',
          'IN_PRODUCTION',
          'SHIPPED'
        )
      ORDER BY updated_at ASC
      LIMIT 50
    `
  ).all();
  const orders = result.results || [];
  console.log("FULFILLMENT RECONCILIATION START", {
    count: orders.length
  });
  let reconciled = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      await reconcileStoredFulfillmentOrder(
        env,
        order
      );
      reconciled += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "FULFILLMENT RECONCILIATION ERROR",
        {
          orderId: order.id,
          reference: order.order_reference,
          providerOrderId: order.fulfillment_order_id,
          message: error?.message || String(error)
        }
      );
    }
  }
  console.log("FULFILLMENT RECONCILIATION COMPLETE", {
    total: orders.length,
    reconciled,
    failed
  });
  return {
    total: orders.length,
    reconciled,
    failed
  };
}
__name(reconcileActiveFulfillmentOrders, "reconcileActiveFulfillmentOrders");
async function sendOrderConfirmationSafely(env, orderId) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "ORDER CONFIRMATION SUPPRESSED",
      {
        orderId,
        environment: "sandbox"
      }
    );
    return;
  }
  const type = NOTIFICATION_TYPES.ORDER_CONFIRMATION;
  let claimed = false;
  try {
    const order = await env.DB.prepare(
      `
          SELECT
            id,
            order_reference,
			customer_status_token,
            email,
            customer_name,
            shipping_address1,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_postal_code,
            shipping_country,
            merchandise_subtotal,
            subtotal,
            shipping_amount,
            tax_amount,
            total,
            currency,
            payment_status
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
    ).bind(orderId).first();
    if (!order) {
      throw new Error(
        "Order confirmation order could not be loaded."
      );
    }
    if (order.payment_status !== "PAID") {
      console.log(
        "ORDER CONFIRMATION SKIPPED",
        {
          orderId,
          reason: "Order is not PAID"
        }
      );
      return;
    }
    claimed = await claimOrderNotification(
      env,
      {
        orderId,
        type,
        provider: env.EMAIL_PROVIDER || "resend"
      }
    );
    if (!claimed) {
      console.log(
        "ORDER CONFIRMATION SKIPPED",
        {
          orderId,
          reason: "Notification already claimed"
        }
      );
      return;
    }
    const itemResult = await env.DB.prepare(
      `
		  SELECT
			id,
			order_id,
			product_id,
			sku,
			product_name,
			color,
			size,
			options_json,
			quantity,
			unit_price
		  FROM order_items
		  WHERE order_id = ?
		  ORDER BY id ASC
		`
    ).bind(orderId).all();
    const items = (itemResult.results || []).map(
      (item) => {
        let options = {};
        if (item.options_json) {
          try {
            options = JSON.parse(
              item.options_json
            );
          } catch (error) {
            console.error(
              "INVALID ORDER ITEM OPTIONS JSON",
              {
                orderItemId: item.id,
                optionsJson: item.options_json,
                message: error?.message || String(error)
              }
            );
          }
        }
        if (Object.keys(options).length === 0) {
          if (item.color) {
            options.color = item.color;
          }
          if (item.size) {
            options.size = item.size;
          }
        }
        return {
          ...item,
          options
        };
      }
    );
    if (items.length === 0) {
      throw new Error(
        "Order confirmation has no order items."
      );
    }
    const result = await sendOrderConfirmation(
      env,
      order,
      items
    );
    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId: result?.id || null
      }
    );
    console.log(
      "ORDER CONFIRMATION SENT",
      {
        orderId: order.id,
        reference: order.order_reference,
        emailId: result?.id || null
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (notificationError) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message: notificationError?.message || String(
              notificationError
            )
          }
        );
      }
    }
    console.error(
      "ORDER CONFIRMATION ERROR",
      {
        orderId,
        message: error?.message || String(error)
      }
    );
  }
}
__name(sendOrderConfirmationSafely, "sendOrderConfirmationSafely");
async function attemptFulfillment(env, orderId) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "FULFILLMENT SUPPRESSED",
      {
        orderId,
        environment: "sandbox"
      }
    );
    return;
  }
  const claim = await env.DB.prepare(
    `
      UPDATE orders
      SET
        fulfillment_status = 'SUBMITTING',
        fulfillment_attempts = fulfillment_attempts + 1,
        fulfillment_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND payment_status = 'PAID'
        AND fulfillment_status IN ('PENDING', 'READY')  
    `
  ).bind(orderId).run();
  if (!claim.meta || Number(claim.meta.changes || 0) === 0) {
    console.log(
      "FULFILLMENT NOT CLAIMED",
      { orderId }
    );
    return;
  }
  console.log(
    "FULFILLMENT CLAIMED",
    { orderId }
  );
  try {
    const order = await env.DB.prepare(
      `
        SELECT
          id,
          order_reference,
          email,
          customer_name,
          phone,
          shipping_address1,
          shipping_address2,
          shipping_city,
          shipping_state,
          shipping_postal_code,
          shipping_country,
          merchandise_subtotal,
          shipping_amount,
          tax_amount,
          total,
          currency,
          payment_status,
          transaction_id,
          fulfillment_status
        FROM orders
        WHERE id = ?
        LIMIT 1
      `
    ).bind(orderId).first();
    if (!order) {
      throw new Error(
        "Fulfillment order could not be loaded."
      );
    }
    const itemResult = await env.DB.prepare(
      `
        SELECT
          id,
          order_id,
          product_id,
          sku,
          product_name,
          color,
          size,
          quantity,
          unit_price
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `
    ).bind(orderId).all();
    const orderItems = itemResult.results || [];
    if (orderItems.length === 0) {
      throw new Error(
        "Order has no fulfillment items."
      );
    }
    console.log(
      "SUBMITTING ORDER TO FULFILLMENT",
      {
        orderId: order.id,
        reference: order.order_reference,
        itemCount: orderItems.length
      }
    );
    const fulfillment = await fulfillOrder(
      env,
      order,
      orderItems
    );
    const providerOrderId = fulfillment?.data?.id;
    if (!providerOrderId) {
      throw new Error(
        "Fulfillment provider did not return an order ID."
      );
    }
    await env.DB.prepare(
      `
        UPDATE orders
        SET
          fulfillment_provider = ?,
          fulfillment_order_id = ?,
          fulfillment_status = ?,
          fulfillment_provider_status = ?,
          fulfillment_error = NULL,
          fulfillment_reconciled_at = CURRENT_TIMESTAMP,
          tracking_number = COALESCE(?, tracking_number),
          tracking_url = COALESCE(?, tracking_url),
          carrier = COALESCE(?, carrier),
          shipped_at = COALESCE(?, shipped_at),
          delivered_at = COALESCE(?, delivered_at),
          fulfilled_at = COALESCE(?, fulfilled_at),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
			AND payment_status = 'PAID'
			AND fulfillment_status = 'SUBMITTING'
      `
    ).bind(
      fulfillment.provider,
      String(providerOrderId),
      fulfillment.status || "SUBMITTED",
      fulfillment.providerStatus || fulfillment?.data?.status || null,
      fulfillment.trackingNumber || null,
      fulfillment.trackingUrl || null,
      fulfillment.carrier || null,
      fulfillment.shippedAt || null,
      fulfillment.deliveredAt || null,
      fulfillment.fulfilledAt || null,
      orderId
    ).run();
    console.log(
      "FULFILLMENT ORDER CREATED",
      {
        orderId: order.id,
        reference: order.order_reference,
        provider: fulfillment.provider,
        providerOrderId: String(providerOrderId),
        status: fulfillment.status || "SUBMITTED",
        providerStatus: fulfillment.providerStatus || fulfillment?.data?.status || null
      }
    );
  } catch (error) {
    console.error(
      "FULFILLMENT ERROR",
      {
        orderId,
        message: error?.message || String(error)
      }
    );
    const errorMessage = String(
      error?.message || "Unknown fulfillment error."
    ).slice(0, 1e3);
    await env.DB.prepare(
      `
		UPDATE orders
		SET
		  fulfillment_status = 'FAILED',
		  fulfillment_error = ?,
		  updated_at = CURRENT_TIMESTAMP
		  WHERE id = ?
			AND payment_status = 'PAID'
			AND fulfillment_status = 'SUBMITTING'
	  `
    ).bind(errorMessage, orderId).run();
    await sendFulfillmentFailureAlertSafely(
      env,
      orderId
    );
  }
}
__name(attemptFulfillment, "attemptFulfillment");
async function handlePrintifyWebhook(request, env) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "PRINTIFY WEBHOOK SUPPRESSED",
      {
        environment: "sandbox"
      }
    );
    return Response.json(
      {
        received: true,
        suppressed: true
      },
      {
        status: 200
      }
    );
  }
  const rawBody = await request.text();
  const signature = request.headers.get(
    "X-Pfy-Signature"
  );
  const validSignature = await verifyPrintifyWebhookSignature(
    env,
    rawBody,
    signature
  );
  if (!validSignature) {
    console.error(
      "PRINTIFY WEBHOOK SIGNATURE REJECTED"
    );
    return Response.json(
      {
        error: "Invalid webhook signature."
      },
      {
        status: 401
      }
    );
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      {
        error: "Invalid webhook JSON."
      },
      {
        status: 400
      }
    );
  }
  const eventId = cleanString(
    payload?.id,
    200
  );
  const eventType = cleanString(
    payload?.type,
    100
  );
  const resourceType = cleanString(
    payload?.resource?.type,
    50
  );
  const providerOrderId = cleanString(
    payload?.resource?.id,
    200
  );
  const webhookShopId = String(
    payload?.resource?.data?.shop_id ?? ""
  ).trim();
  console.log(
    "PRINTIFY WEBHOOK RECEIVED",
    {
      eventId: eventId || null,
      eventType: eventType || null,
      resourceType: resourceType || null,
      providerOrderId: providerOrderId || null,
      shopId: webhookShopId || null
    }
  );
  if (!eventId || !eventType || !providerOrderId) {
    console.error(
      "PRINTIFY WEBHOOK INCOMPLETE",
      {
        eventId: eventId || null,
        eventType: eventType || null,
        providerOrderId: providerOrderId || null
      }
    );
    return Response.json(
      {
        error: "Incomplete webhook payload."
      },
      {
        status: 400
      }
    );
  }
  if (!PRINTIFY_WEBHOOK_EVENTS.has(
    eventType
  )) {
    console.log(
      "PRINTIFY WEBHOOK EVENT IGNORED",
      {
        eventId,
        eventType
      }
    );
    return Response.json(
      {
        received: true,
        ignored: true
      },
      {
        status: 200
      }
    );
  }
  if (resourceType && resourceType !== "order") {
    console.log(
      "PRINTIFY NON-ORDER WEBHOOK IGNORED",
      {
        eventId,
        eventType,
        resourceType
      }
    );
    return Response.json(
      {
        received: true,
        ignored: true
      },
      {
        status: 200
      }
    );
  }
  if (webhookShopId && String(
    env.PRINTIFY_SHOP_ID || ""
  ) !== webhookShopId) {
    console.error(
      "PRINTIFY WEBHOOK SHOP MISMATCH",
      {
        eventId,
        webhookShopId,
        expectedShopId: String(
          env.PRINTIFY_SHOP_ID || ""
        )
      }
    );
    return Response.json(
      {
        error: "Webhook shop mismatch."
      },
      {
        status: 403
      }
    );
  }
  const order = await loadFulfillmentOrderByProviderId(
    env,
    "printify",
    providerOrderId
  );
  if (!order) {
    console.log(
      "PRINTIFY WEBHOOK ORDER NOT FOUND",
      {
        eventId,
        eventType,
        providerOrderId
      }
    );
    return Response.json(
      {
        received: true,
        orderFound: false
      },
      {
        status: 200
      }
    );
  }
  const eventClaim = await env.DB.prepare(
    `
      INSERT OR IGNORE INTO fulfillment_webhook_events (
        provider,
        event_id,
        event_type,
        order_id
      )
      VALUES (?, ?, ?, ?)
    `
  ).bind(
    "printify",
    eventId,
    eventType,
    order.id
  ).run();
  if (Number(eventClaim.meta.changes || 0) === 0) {
    console.log(
      "PRINTIFY WEBHOOK DUPLICATE",
      {
        eventId,
        eventType,
        orderId: order.id
      }
    );
    return Response.json(
      {
        received: true,
        duplicate: true
      },
      {
        status: 200
      }
    );
  }
  try {
    const reconciliation = await reconcileStoredFulfillmentOrder(
      env,
      order,
      {
        eventId,
        eventPayload: payload
      }
    );
    console.log(
      "PRINTIFY WEBHOOK PROCESSED",
      {
        eventId,
        eventType,
        orderId: order.id,
        reference: order.order_reference,
        status: reconciliation.status,
        providerStatus: reconciliation.providerStatus || null
      }
    );
    return Response.json(
      {
        received: true,
        reconciled: true
      },
      {
        status: 200
      }
    );
  } catch (error) {
    try {
      await env.DB.prepare(
        `
        DELETE FROM fulfillment_webhook_events
        WHERE provider = ?
          AND event_id = ?
          AND order_id = ?
      `
      ).bind(
        "printify",
        eventId,
        order.id
      ).run();
    } catch (releaseError) {
      console.error(
        "PRINTIFY WEBHOOK CLAIM RELEASE ERROR",
        {
          eventId,
          eventType,
          orderId: order.id,
          message: releaseError?.message || String(releaseError)
        }
      );
    }
    console.error(
      "PRINTIFY WEBHOOK RECONCILIATION ERROR",
      {
        eventId,
        eventType,
        providerOrderId,
        orderId: order.id,
        message: error?.message || String(error)
      }
    );
    return Response.json(
      {
        error: "Fulfillment reconciliation failed."
      },
      {
        status: 500
      }
    );
  }
}
__name(handlePrintifyWebhook, "handlePrintifyWebhook");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const storeConfig = getStoreConfig(env);
    const corsHeaders = {
      "Access-Control-Allow-Origin": storeConfig.storefrontOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "POST" && url.pathname === "/api/webhooks/printify") {
      return handlePrintifyWebhook(
        request,
        env
      );
    }
    if (request.method === "OPTIONS") {
      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );
    }
    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(
        {
          status: "ok",
          service: "jekyll-commerce-api"
        },
        200,
        corsHeaders
      );
    }
    if (request.method === "POST" && url.pathname === "/api/checkout") {
      try {
        let body;
        try {
          body = await request.json();
        } catch (error) {
          return jsonResponse(
            {
              error: "INVALID_CHECKOUT_REQUEST",
              message: "The checkout request contains invalid JSON."
            },
            400,
            corsHeaders
          );
        }
        const email = cleanString(
          body.email,
          254
        );
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
          return jsonResponse(
            {
              error: "A valid email address is required."
            },
            400,
            corsHeaders
          );
        }
        const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
        const shipping = customer.shipping && typeof customer.shipping === "object" ? customer.shipping : {};
        const customerName = cleanString(
          customer.name,
          120
        );
        const phone = cleanString(
          customer.phone,
          40
        );
        const address1 = cleanString(
          shipping.address1,
          160
        );
        const address2 = cleanString(
          shipping.address2,
          160
        );
        const city = cleanString(
          shipping.city,
          100
        );
        const state = cleanString(
          shipping.state,
          2
        ).toUpperCase();
        const postalCode = cleanString(
          shipping.postalCode,
          10
        );
        const country = cleanString(
          shipping.country,
          2
        ).toUpperCase();
        const zipPattern = /^\d{5}(-\d{4})?$/;
        const statePattern = /^[A-Z]{2}$/;
        if (!customerName) {
          return jsonResponse(
            {
              error: "Customer name is required."
            },
            400,
            corsHeaders
          );
        }
        if (!address1) {
          return jsonResponse(
            {
              error: "Shipping address is required."
            },
            400,
            corsHeaders
          );
        }
        if (!city) {
          return jsonResponse(
            {
              error: "Shipping city is required."
            },
            400,
            corsHeaders
          );
        }
        if (!statePattern.test(state)) {
          return jsonResponse(
            {
              error: "A valid shipping state is required."
            },
            400,
            corsHeaders
          );
        }
        if (!zipPattern.test(
          postalCode
        )) {
          return jsonResponse(
            {
              error: "A valid ZIP code is required."
            },
            400,
            corsHeaders
          );
        }
        if (country !== "US") {
          return jsonResponse(
            {
              error: "Only United States shipping is currently supported."
            },
            400,
            corsHeaders
          );
        }
        const items = Array.isArray(body.items) ? body.items : [];
        if (items.length === 0) {
          return jsonResponse(
            {
              error: "Cart is empty."
            },
            400,
            corsHeaders
          );
        }
        let merchandiseSubtotal = 0;
        const validatedItems = [];
        for (const item of items) {
          const product = products[item.sku];
          if (!product) {
            return jsonResponse(
              {
                error: `Invalid SKU: ${item.sku}`
              },
              400,
              corsHeaders
            );
          }
          if (product.productId !== item.productId) {
            return jsonResponse(
              {
                error: "Product ID does not match SKU."
              },
              400,
              corsHeaders
            );
          }
          const quantity = Number(item.quantity);
          if (!Number.isInteger(
            quantity
          ) || quantity < 1 || quantity > storeConfig.maxQuantity) {
            return jsonResponse(
              {
                error: "Invalid quantity."
              },
              400,
              corsHeaders
            );
          }
          merchandiseSubtotal += product.price * quantity;
          validatedItems.push({
            productId: product.productId,
            sku: item.sku,
            quantity,
            unitPrice: product.price,
            name: product.name,
            taxCode: product.taxCode || null
          });
        }
        const shippingCustomer = {
          name: customerName,
          email,
          phone,
          address1,
          address2,
          city,
          state,
          postalCode,
          country
        };
        const shippingQuote = await calculateShipping(
          env,
          shippingCustomer,
          validatedItems
        );
        const shippingAmount = Number(
          shippingQuote.amount
        );
        if (!Number.isInteger(
          shippingAmount
        ) || shippingAmount < 0) {
          throw new Error(
            "Invalid shipping amount."
          );
        }
        const taxQuote = await calculateFloridaTax(
          env,
          {
            shipping: shippingCustomer,
            merchandiseSubtotal,
            shippingAmount
          }
        );
        const taxAmount = Number(
          taxQuote.taxAmount
        );
        if (!Number.isInteger(
          taxAmount
        ) || taxAmount < 0) {
          throw new Error(
            "Invalid tax amount."
          );
        }
        const total = merchandiseSubtotal + shippingAmount + taxAmount;
        const displayTaxRate = Number(
          Number(
            taxQuote.combinedRate || 0
          ).toFixed(6)
        );
        console.log(
          "FLORIDA TAX RESULT",
          {
            taxable: taxQuote.taxable,
            county: taxQuote.jurisdiction?.countyName || null,
            taxableBase: taxQuote.taxableBase,
            stateRate: taxQuote.stateRate,
            surtaxRate: taxQuote.surtaxRate,
            stateTaxAmount: taxQuote.stateTaxAmount,
            surtaxAmount: taxQuote.surtaxAmount,
            taxAmount: taxQuote.taxAmount
          }
        );
        console.log(
          "CHECKOUT TOTALS",
          {
            merchandiseSubtotal,
            shippingAmount,
            taxAmount,
            total,
            shippingProvider: shippingQuote.provider,
            shippingMethod: shippingQuote.method,
            taxProvider: "florida-dor",
            taxRate: displayTaxRate,
            taxCounty: taxQuote.jurisdiction?.countyName || null
          }
        );
        const reference = `order-${crypto.randomUUID()}`;
        console.log(
          "CREATING ORDER",
          {
            reference,
            email,
            merchandiseSubtotal,
            shippingAmount,
            taxAmount,
            total
          }
        );
        const {
          orderId,
          customerStatusToken
        } = await createOrderWithItems(
          env,
          {
            reference,
            email,
            customerName,
            address1,
            address2,
            city,
            state,
            postalCode,
            country,
            phone,
            currency: storeConfig.currency,
            merchandiseSubtotal,
            shippingAmount,
            taxAmount,
            total
          },
          validatedItems
        );
        console.log(
          "D1 ORDER CREATED",
          {
            orderId,
            reference,
            itemCount: validatedItems.length
          }
        );
        const hpp = await createHostedPaymentPage(
          env,
          {
            amount: total,
            currency: storeConfig.currency,
            reference,
            email,
            customerName,
            paymentReturnUrl: storeConfig.paymentReturnUrl
          }
        );
        if (!hpp?.url) {
          return jsonResponse(
            {
              error: "Checkout URL was not returned."
            },
            502,
            corsHeaders
          );
        }
        return jsonResponse(
          {
            checkoutUrl: hpp.url,
            totals: {
              merchandiseSubtotal,
              shippingAmount,
              taxAmount,
              total
            }
          },
          200,
          corsHeaders
        );
      } catch (error) {
        console.error(
          "Checkout error:",
          error
        );
        const errorMessage = error?.message || String(error);
        let status = 500;
        let code = "CHECKOUT_UNAVAILABLE";
        let message = "Checkout is temporarily unavailable. Please try again.";
        if (errorMessage.includes(
          "No shipping mapping exists for SKU"
        )) {
          status = 400;
          code = "VARIANT_UNAVAILABLE";
          message = "This product option is currently unavailable. Please choose another option.";
        }
        return jsonResponse(
          {
            error: code,
            message
          },
          status,
          corsHeaders
        );
      }
    }
    if (request.method === "GET" && url.pathname === "/api/order-status") {
      try {
        const token = url.searchParams.get(
          "token"
        );
        if (!token || token.length < 32 || token.length > 200) {
          return new Response(
            JSON.stringify({
              error: "ORDER_NOT_FOUND",
              message: "Order status could not be found."
            }),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json; charset=UTF-8",
                "Cache-Control": "no-store"
              }
            }
          );
        }
        const order = await env.DB.prepare(
          `
			  SELECT
				id,
				order_reference,
				payment_status,
				fulfillment_status,
				merchandise_subtotal,
				shipping_amount,
				tax_amount,
				total,
				currency,
				tracking_number,
				tracking_url,
				carrier,
				shipped_at,
				delivered_at,
				created_at,
				updated_at
			  FROM orders
			  WHERE customer_status_token = ?
			  LIMIT 1
			`
        ).bind(token).first();
        if (!order) {
          return new Response(
            JSON.stringify({
              error: "ORDER_NOT_FOUND",
              message: "Order status could not be found."
            }),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json; charset=UTF-8",
                "Cache-Control": "no-store"
              }
            }
          );
        }
        const itemResult = await env.DB.prepare(
          `
			  SELECT
				product_name,
				sku,
				quantity,
				unit_price,
				options_json
			  FROM order_items
			  WHERE order_id = ?
			  ORDER BY id ASC
			`
        ).bind(order.id).all();
        const items = (itemResult.results || []).map((item) => {
          let options = {};
          if (item.options_json) {
            try {
              options = JSON.parse(
                item.options_json
              );
            } catch (error) {
              console.error(
                "INVALID ORDER STATUS ITEM OPTIONS",
                {
                  sku: item.sku,
                  message: error?.message || String(error)
                }
              );
            }
          }
          return {
            name: item.product_name,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            options
          };
        });
        const responseBody = {
          orderReference: order.order_reference,
          paymentStatus: order.payment_status,
          fulfillmentStatus: order.fulfillment_status,
          totals: {
            merchandise: order.merchandise_subtotal,
            shipping: order.shipping_amount,
            tax: order.tax_amount,
            total: order.total,
            currency: order.currency
          },
          items,
          tracking: {
            carrier: order.carrier || null,
            number: order.tracking_number || null,
            url: order.tracking_url || null
          },
          dates: {
            created: order.created_at || null,
            updated: order.updated_at || null,
            shipped: order.shipped_at || null,
            delivered: order.delivered_at || null
          }
        };
        return new Response(
          JSON.stringify(
            responseBody
          ),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json; charset=UTF-8",
              /*
               * Status URLs contain a
               * capability token, so do
               * not allow intermediary
               * caching.
               */
              "Cache-Control": "no-store"
            }
          }
        );
      } catch (error) {
        console.error(
          "ORDER STATUS ERROR",
          {
            message: error?.message || String(error)
          }
        );
        return new Response(
          JSON.stringify({
            error: "ORDER_STATUS_UNAVAILABLE",
            message: "Order status is temporarily unavailable. Please try again."
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json; charset=UTF-8",
              "Cache-Control": "no-store"
            }
          }
        );
      }
    }
    if (url.pathname === "/api/payment-return") {
      const queryReference = url.searchParams.get(
        "reference"
      );
      if (request.method === "POST") {
        try {
          const callback = await request.json();
          console.log(
            "GLOBAL PAYMENTS CALLBACK",
            {
              id: callback.id,
              status: callback.status,
              amount: callback.amount,
              currency: callback.currency,
              reference: callback.reference,
              queryReference
            }
          );
          if (!callback.id || !callback.reference || !callback.status || callback.amount === void 0 || !callback.currency || !queryReference) {
            throw new Error(
              "Incomplete payment callback."
            );
          }
          if (queryReference !== callback.reference) {
            throw new Error(
              "Callback reference mismatch."
            );
          }
          const order = await env.DB.prepare(
            `
				SELECT
				  id,
				  order_reference,
				  customer_status_token,
				  merchandise_subtotal,
				  shipping_amount,
				  tax_amount,
				  total,
				  currency,
				  payment_status,
				  transaction_id,
				  fulfillment_status
				FROM orders
                WHERE order_reference = ?
                LIMIT 1
              `
          ).bind(
            callback.reference
          ).first();
          if (!order) {
            throw new Error(
              "Order not found."
            );
          }
          if (order.payment_status === "PAID" && order.transaction_id === callback.id) {
            if (ctx?.waitUntil) {
              ctx.waitUntil(
                attemptFulfillment(
                  env,
                  order.id
                )
              );
              ctx.waitUntil(
                sendOrderConfirmationSafely(
                  env,
                  order.id
                )
              );
            }
            const successUrl = new URL(
              storeConfig.successUrl
            );
            successUrl.searchParams.set(
              "order",
              order.order_reference
            );
            if (order.customer_status_token) {
              successUrl.searchParams.set(
                "token",
                order.customer_status_token
              );
            }
            return paymentRedirect(
              successUrl.toString()
            );
          }
          const idPresent = Boolean(callback.id);
          const referenceMatches = callback.reference === order.order_reference;
          const amountMatches = Number(
            callback.amount
          ) === Number(order.total);
          const currencyMatches = callback.currency === order.currency;
          const paymentCaptured = callback.status === "CAPTURED";
          const paymentDeclined = callback.status === "DECLINED";
          const paymentReversed = callback.status === "REVERSED";
          console.log(
            "HPP PAYMENT VALIDATION",
            {
              orderId: order.id,
              expectedTotal: order.total,
              callbackAmount: callback.amount,
              idPresent,
              referenceMatches,
              amountMatches,
              currencyMatches,
              paymentCaptured,
              paymentDeclined,
              paymentReversed
            }
          );
          if (idPresent && referenceMatches && amountMatches && currencyMatches && paymentCaptured) {
            const paidUpdate = await env.DB.prepare(
              `
                  UPDATE orders
                  SET
                    payment_status = 'PAID',
                    transaction_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                    AND payment_status = 'PENDING'
                    AND transaction_id IS NULL
                `
            ).bind(
              callback.id,
              order.id
            ).run();
            const paidChanges = Number(
              paidUpdate.meta?.changes || 0
            );
            if (paidChanges === 0) {
              const currentState = await loadPaymentState(
                env,
                order.id
              );
              if (currentState?.payment_status === "PAID" && currentState?.transaction_id === callback.id) {
                console.log(
                  "DUPLICATE CAPTURE ACCEPTED",
                  {
                    orderId: order.id,
                    transactionId: callback.id
                  }
                );
                if (ctx?.waitUntil) {
                  ctx.waitUntil(
                    attemptFulfillment(
                      env,
                      order.id
                    )
                  );
                } else {
                  await attemptFulfillment(
                    env,
                    order.id
                  );
                }
                const successUrl2 = new URL(
                  storeConfig.successUrl
                );
                successUrl2.searchParams.set(
                  "order",
                  order.order_reference
                );
                if (order.customer_status_token) {
                  successUrl2.searchParams.set(
                    "token",
                    order.customer_status_token
                  );
                }
                return paymentRedirect(
                  successUrl2.toString()
                );
              }
              console.error(
                "PAYMENT STATE CONFLICT",
                {
                  orderId: order.id,
                  incomingTransactionId: callback.id,
                  currentPaymentStatus: currentState?.payment_status || null,
                  currentTransactionId: currentState?.transaction_id || null
                }
              );
              return paymentRedirect(
                storeConfig.failedUrl
              );
            }
            console.log(
              "ORDER MARKED PAID",
              {
                orderId: order.id,
                reference: order.order_reference,
                transactionId: callback.id,
                total: order.total
              }
            );
            if (ctx?.waitUntil) {
              ctx.waitUntil(
                attemptFulfillment(
                  env,
                  order.id
                )
              );
              ctx.waitUntil(
                sendOrderConfirmationSafely(
                  env,
                  order.id
                )
              );
            } else {
              await Promise.allSettled([
                attemptFulfillment(
                  env,
                  order.id
                ),
                sendOrderConfirmationSafely(
                  env,
                  order.id
                )
              ]);
            }
            const successUrl = new URL(
              storeConfig.successUrl
            );
            successUrl.searchParams.set(
              "order",
              order.order_reference
            );
            if (order.customer_status_token) {
              successUrl.searchParams.set(
                "token",
                order.customer_status_token
              );
            }
            return paymentRedirect(
              successUrl.toString()
            );
          }
          if (idPresent && referenceMatches && amountMatches && currencyMatches && (paymentDeclined || paymentReversed)) {
            const failedUpdate = await env.DB.prepare(
              `
                  UPDATE orders
                  SET
                    payment_status = 'FAILED',
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                    AND payment_status = 'PENDING'
                    AND transaction_id IS NULL
                `
            ).bind(
              order.id
            ).run();
            const failedChanges = Number(
              failedUpdate.meta?.changes || 0
            );
            if (failedChanges === 0) {
              const currentState = await loadPaymentState(
                env,
                order.id
              );
              if (currentState?.payment_status === "PAID") {
                console.log(
                  "FAILED PAYMENT RESULT IGNORED FOR PAID ORDER",
                  {
                    orderId: order.id,
                    transactionId: currentState.transaction_id
                  }
                );
                if (ctx?.waitUntil) {
                  ctx.waitUntil(
                    attemptFulfillment(
                      env,
                      order.id
                    )
                  );
                } else {
                  await attemptFulfillment(
                    env,
                    order.id
                  );
                }
                const successUrl = new URL(
                  storeConfig.successUrl
                );
                successUrl.searchParams.set(
                  "order",
                  order.order_reference
                );
                if (order.customer_status_token) {
                  successUrl.searchParams.set(
                    "token",
                    order.customer_status_token
                  );
                }
                return paymentRedirect(
                  successUrl.toString()
                );
              }
              if (currentState?.payment_status === "FAILED") {
                const failedUrl4 = new URL(
                  storeConfig.failedUrl
                );
                failedUrl4.searchParams.set(
                  "reason",
                  "declined"
                );
                return paymentRedirect(
                  failedUrl4.toString()
                );
              }
              console.error(
                "FAILED PAYMENT STATE CONFLICT",
                {
                  orderId: order.id,
                  currentPaymentStatus: currentState?.payment_status || null,
                  currentTransactionId: currentState?.transaction_id || null
                }
              );
              const failedUrl3 = new URL(
                storeConfig.failedUrl
              );
              failedUrl3.searchParams.set(
                "reason",
                "error"
              );
              return paymentRedirect(
                failedUrl3.toString()
              );
            }
            console.log(
              "ORDER MARKED FAILED",
              {
                orderId: order.id,
                reference: order.order_reference,
                gpStatus: callback.status
              }
            );
            const failedUrl2 = new URL(
              storeConfig.failedUrl
            );
            failedUrl2.searchParams.set(
              "reason",
              "declined"
            );
            return paymentRedirect(
              failedUrl2.toString()
            );
          }
          console.error(
            "PAYMENT RESULT NOT ACCEPTED",
            {
              orderId: order.id,
              callbackStatus: callback.status,
              expectedTotal: order.total,
              callbackAmount: callback.amount,
              idPresent,
              referenceMatches,
              amountMatches,
              currencyMatches
            }
          );
          const failedUrl = new URL(
            storeConfig.failedUrl
          );
          failedUrl.searchParams.set(
            "reason",
            "error"
          );
          return paymentRedirect(
            failedUrl.toString()
          );
        } catch (error) {
          console.error(
            "Payment callback error:",
            error
          );
          const failedUrl = new URL(
            storeConfig.failedUrl
          );
          failedUrl.searchParams.set(
            "reason",
            "error"
          );
          return paymentRedirect(
            failedUrl.toString()
          );
        }
      }
      if (request.method === "GET") {
        try {
          if (!queryReference) {
            const failedUrl2 = new URL(
              storeConfig.failedUrl
            );
            failedUrl2.searchParams.set(
              "reason",
              "error"
            );
            return paymentRedirect(
              failedUrl2.toString()
            );
          }
          const order = await env.DB.prepare(
            `
			SELECT
			  payment_status,
			  order_reference,
			  customer_status_token
			FROM orders
			WHERE order_reference = ?
			LIMIT 1
              `
          ).bind(
            queryReference
          ).first();
          if (order?.payment_status === "PAID") {
            const successUrl = new URL(
              storeConfig.successUrl
            );
            successUrl.searchParams.set(
              "order",
              order.order_reference
            );
            if (order.customer_status_token) {
              successUrl.searchParams.set(
                "token",
                order.customer_status_token
              );
            }
            return paymentRedirect(
              successUrl.toString()
            );
          }
          const failedUrl = new URL(
            storeConfig.failedUrl
          );
          failedUrl.searchParams.set(
            "reason",
            "error"
          );
          return paymentRedirect(
            failedUrl.toString()
          );
        } catch (error) {
          console.error(
            "Payment return page error:",
            error
          );
          const failedUrl = new URL(
            storeConfig.failedUrl
          );
          failedUrl.searchParams.set(
            "reason",
            "error"
          );
          return paymentRedirect(
            failedUrl.toString()
          );
        }
      }
      return new Response(
        "Method Not Allowed",
        {
          status: 405
        }
      );
    }
    return new Response(
      "Not Found",
      {
        status: 404,
        headers: corsHeaders
      }
    );
  },
  async scheduled(controller, env, ctx) {
    if (env.APP_ENV === "sandbox") {
      console.log(
        "SCHEDULED FULFILLMENT RECONCILIATION SUPPRESSED",
        {
          environment: "sandbox"
        }
      );
      return;
    }
    console.log(
      "SCHEDULED FULFILLMENT RECONCILIATION",
      {
        scheduledTime: controller.scheduledTime,
        cron: controller.cron
      }
    );
    ctx.waitUntil(
      Promise.allSettled([
        recoverPendingFulfillmentOrders(
          env
        ),
        detectStaleSubmittingFulfillmentOrders(
          env
        ),
        reconcileActiveFulfillmentOrders(
          env
        )
      ])
    );
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
