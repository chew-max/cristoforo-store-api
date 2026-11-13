const PRINTIFY_API =
  "https://api.printify.com/v1";


function splitName(fullName) {
  const value =
    String(fullName || "").trim();

  if (!value) {
    return {
      firstName: "",
      lastName: ""
    };
  }

  const parts =
    value.split(/\s+/);

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


async function printifyRequest(
  env,
  path,
  options = {}
) {
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
    "Authorization":
      `Bearer ${env.PRINTIFY_API_TOKEN}`,

    "User-Agent":
      "jekyll-commerce-api",

    "Content-Type":
      "application/json",

    ...(options.headers || {})
  };

  const response =
    await fetch(
      `${PRINTIFY_API}${path}`,
      {
        ...options,
        headers
      }
    );

  const text =
    await response.text();

  let data = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data =
        text;
    }
  }

  if (!response.ok) {
	console.error(
	  "PRINTIFY API ERROR",
	  {
		httpStatus:
		  response.status
	  }
	);

    const message =
      data?.message ||
      data?.error ||
      `Printify request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return data;
}


function buildAddress(customer) {
  const name =
    splitName(customer.name);

  return {
    first_name:
      name.firstName,

    last_name:
      name.lastName,

    email:
      customer.email,

    phone:
      customer.phone || "",

    country:
      customer.country || "US",

    region:
      customer.state,

    address1:
      customer.address1,

    address2:
      customer.address2 || "",

    city:
      customer.city,

    zip:
      customer.postalCode
  };
}


function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toISOString();
}


function getShipments(data) {
  if (
    !Array.isArray(data?.shipments)
  ) {
    return [];
  }

  return data.shipments;
}


function getPrimaryShipment(data) {
  const shipments =
    getShipments(data);

  if (shipments.length === 0) {
    return null;
  }

  return (
    shipments.find(function (shipment) {
      return (
        shipment?.number ||
        shipment?.url ||
        shipment?.carrier
      );
    }) ||
    shipments[0]
  );
}


function allShipmentsDelivered(data) {
  const shipments =
    getShipments(data);

  if (shipments.length === 0) {
    return false;
  }

  return shipments.every(
    function (shipment) {
      return Boolean(
        shipment?.delivered_at
      );
    }
  );
}


function getDeliveredAt(data) {
  const shipments =
    getShipments(data);

  const delivered =
    shipments
      .map(function (shipment) {
        return shipment?.delivered_at;
      })
      .filter(Boolean);

  if (delivered.length === 0) {
    return null;
  }

  const timestamps =
    delivered
      .map(function (value) {
        const date =
          new Date(value);

        if (
          Number.isNaN(
            date.getTime()
          )
        ) {
          return null;
        }

        return date;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return (
          a.getTime() -
          b.getTime()
        );
      });

  if (timestamps.length === 0) {
    return normalizeTimestamp(
      delivered[
        delivered.length - 1
      ]
    );
  }

  return timestamps[
    timestamps.length - 1
  ].toISOString();
}


function getShippedAt(data) {
  const shipments =
    getShipments(data);

  const shipmentDates =
    shipments
      .map(function (shipment) {
        return (
          shipment?.shipped_at ||
          shipment?.created_at ||
          null
        );
      })
      .filter(Boolean);

  if (shipmentDates.length > 0) {
    return normalizeTimestamp(
      shipmentDates[0]
    );
  }

  if (
    data?.status === "fulfilled" ||
    data?.status ===
      "partially-fulfilled"
  ) {
    return normalizeTimestamp(
      data?.fulfilled_at
    );
  }

  return null;
}


export function normalizePrintifyOrder(
  data
) {
  if (!data) {
    throw new Error(
      "Printify order data is required."
    );
  }

  const providerStatus =
    String(
      data.status || ""
    )
      .trim()
      .toLowerCase();

  const primaryShipment =
    getPrimaryShipment(data);

  const delivered =
    allShipmentsDelivered(data);

  let status =
    "SUBMITTED";

  if (delivered) {
    status =
      "DELIVERED";
  } else {
    switch (providerStatus) {
      case "on-hold":
        status =
          "ON_HOLD";
        break;

      case "sending-to-production":
      case "in-production":
        status =
          "IN_PRODUCTION";
        break;

      case "partially-fulfilled":
      case "fulfilled":
      case "shipped":
        status =
          "SHIPPED";
        break;

      case "delivered":
        status =
          "DELIVERED";
        break;

      case "canceled":
      case "cancelled":
        status =
          "CANCELED";
        break;

      case "payment-not-received":
      case "has-issues":
      case "unfulfillable":
      case "source-check-failed":
        status =
          "FAILED";
        break;

      default:
        status =
          "SUBMITTED";
        break;
    }
  }

	return {
	  providerOrderId:
		data?.id || null,

	  status,

	  providerStatus:
		providerStatus || null,

    trackingNumber:
      primaryShipment?.number ||
      null,

    trackingUrl:
      primaryShipment?.url ||
      null,

    carrier:
      primaryShipment?.carrier ||
      null,

    shippedAt:
      getShippedAt(data),

    deliveredAt:
      getDeliveredAt(data),

    fulfilledAt:
      normalizeTimestamp(
        data?.fulfilled_at
      ),

    sentToProductionAt:
      normalizeTimestamp(
        data?.sent_to_production_at
      ),

    shipments:
      getShipments(data),

    data
  };
}


export async function calculatePrintifyShipping(
  env,
  customer,
  items
) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Shipping quote requires at least one item."
    );
  }

  const lineItems =
    items.map(
      function (item, index) {
        if (
          !item.printifyProductId ||
          !item.printifyVariantId
        ) {
          throw new Error(
            `Missing Printify shipping mapping for SKU ${item.sku}.`
          );
        }

        return {
          product_id:
            item.printifyProductId,

          variant_id:
            item.printifyVariantId,

          quantity:
            item.quantity,

          external_id:
            `shipping-${index + 1}`
        };
      }
    );

  const payload = {
    line_items:
      lineItems,

    address_to:
      buildAddress(customer)
  };

	console.log(
	  "REQUESTING PRINTIFY SHIPPING QUOTE",
	  {
		itemCount:
		  lineItems.length,
		state:
		  customer.state
	  }
	);

  const data =
    await printifyRequest(
      env,

      `/shops/${env.PRINTIFY_SHOP_ID}/orders/shipping.json`,

      {
        method: "POST",

        body:
          JSON.stringify(payload)
      }
    );

	console.log(
	  "PRINTIFY SHIPPING QUOTE RECEIVED",
	  {
		received:
		  Boolean(data)
	  }
	);

  return data;
}


export async function createPrintifyOrder(
  env,
  order,
  items
) {
  if (!order) {
    throw new Error(
      "Order is required for Printify fulfillment."
    );
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Order contains no fulfillment items."
    );
  }

  const name =
    splitName(
      order.customer_name
    );

  const lineItems =
    items.map(
      function (item, index) {
        if (
          !item.printify_product_id ||
          !item.printify_variant_id
        ) {
          throw new Error(
            `Missing Printify mapping for SKU ${item.sku}.`
          );
        }
		
		if (
		  !Number.isInteger(item.quantity) ||
		  item.quantity <= 0
		) {
		  throw new Error(
			`Invalid fulfillment quantity for SKU ${item.sku}.`
		  );
		}

        return {
          product_id:
            item.printify_product_id,

          variant_id:
            item.printify_variant_id,

          quantity:
            item.quantity,

          external_id:
            `${order.order_reference}-${index + 1}`
        };
      }
    );

  const payload = {
    external_id:
      order.order_reference,

    label:
      order.order_reference,

    line_items:
      lineItems,

    shipping_method:
      1,

    is_printify_express:
      false,

    is_economy_shipping:
      false,

    send_shipping_notification:
      false,

    address_to: {
      first_name:
        name.firstName,

      last_name:
        name.lastName,

      email:
        order.email,

      phone:
        order.phone || "",

      country:
        order.shipping_country ||
        "US",

      region:
        order.shipping_state,

      address1:
        order.shipping_address1,

      address2:
        order.shipping_address2 ||
        "",

      city:
        order.shipping_city,

      zip:
        order.shipping_postal_code
    }
  };

  console.log(
    "Creating Printify order:",
    order.order_reference
  );

  const data =
    await printifyRequest(
      env,

      `/shops/${env.PRINTIFY_SHOP_ID}/orders.json`,

      {
        method: "POST",

        body:
          JSON.stringify(payload)
      }
    );

	console.log(
	  "PRINTIFY ORDER CREATED",
	  {
		reference:
		  order.order_reference
	  }
	);
  return data;
}

export async function findPrintifyOrderByExternalId(
  env,
  externalId
) {
  if (!externalId) {
    throw new Error(
      "Printify external order ID is required."
    );
  }

  const expectedExternalId =
    String(externalId);

  let page = 1;

  while (true) {
    const result =
      await printifyRequest(
        env,
        `/shops/${env.PRINTIFY_SHOP_ID}/orders.json?limit=10&page=${page}`,
        {
          method: "GET"
        }
      );

    const orders =
      Array.isArray(result?.data)
        ? result.data
        : [];

    const match =
      orders.find((order) => {
        const providerExternalId =
          order?.external_id ??
          order?.metadata?.shop_order_id ??
          order?.metadata?.shop_order_label;

        return (
          providerExternalId != null &&
          String(providerExternalId) ===
            expectedExternalId
        );
      });

    if (match) {
      return match;
    }

    const currentPage =
      Number(result?.current_page || page);

    const lastPage =
      Number(result?.last_page || currentPage);

    if (
      orders.length === 0 ||
      currentPage >= lastPage
    ) {
      return null;
    }

    page =
      currentPage + 1;
  }
}

export async function getPrintifyOrder(
  env,
  printifyOrderId
) {
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
export async function listPrintifyProducts(env) {
  const data = await printifyRequest(env, `/shops/${env.PRINTIFY_SHOP_ID}/products.json`, { method: "GET" });
  const products = Array.isArray(data?.data) ? data.data : [];
  return products.map(function (product) {
    return { id: product.id, title: product.title, options: product.options || [], variants: Array.isArray(product.variants) ? product.variants.map(function (variant) { return { id: variant.id, title: variant.title, options: variant.options || [], sku: variant.sku || null, enabled: variant.is_enabled ?? null, available: variant.is_available ?? null, default: variant.is_default ?? null }; }) : [] };
  });
}
